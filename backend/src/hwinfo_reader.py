"""
hwinfo_reader.py - Persistent HWiNFO shared memory reader.
Runs continuously, outputting a JSON line every 2 seconds to stdout.
Node.js reads lines from this process rather than spawning it repeatedly.
"""

import json
import sys
import time
import ctypes
from ctypes import Structure, c_uint32, c_double, c_char, c_longlong

HWINFO_SENSORS_MAP_FILE_NAME = "Global\\HWiNFO_SENS_SM2"
HWINFO_SENSORS_STRING_LEN    = 128
HWINFO_UNIT_STRING_LEN       = 16
POLL_INTERVAL                = 2.0  # seconds

TYPE_TEMP  = 1
TYPE_FAN   = 3
TYPE_POWER = 5
TYPE_CLOCK = 6
TYPE_USAGE = 7

class HWiNFO_SENSORS_READING_ELEMENT(Structure):
    _pack_ = 1
    _fields_ = [
        ("tReading",        c_uint32),
        ("dwSensorIndex",   c_uint32),
        ("dwReadingID",     c_uint32),
        ("szLabelOrig",     c_char * HWINFO_SENSORS_STRING_LEN),
        ("szLabelUser",     c_char * HWINFO_SENSORS_STRING_LEN),
        ("szUnit",          c_char * HWINFO_UNIT_STRING_LEN),
        ("Value",           c_double),
        ("ValueMin",        c_double),
        ("ValueMax",        c_double),
        ("ValueAvg",        c_double),
    ]

class HWiNFO_SENSORS_SENSOR_ELEMENT(Structure):
    _pack_ = 1
    _fields_ = [
        ("dwSensorID",       c_uint32),
        ("dwSensorInst",     c_uint32),
        ("szSensorNameOrig", c_char * HWINFO_SENSORS_STRING_LEN),
        ("szSensorNameUser", c_char * HWINFO_SENSORS_STRING_LEN),
    ]

class HWiNFO_SENSORS_SHARED_MEM2(Structure):
    _pack_ = 1
    _fields_ = [
        ("dwSignature",              c_uint32),
        ("dwVersion",                c_uint32),
        ("dwRevision",               c_uint32),
        ("poll_time",                c_longlong),
        ("dwOffsetOfSensorSection",  c_uint32),
        ("dwSizeOfSensorElement",    c_uint32),
        ("dwNumSensorElements",      c_uint32),
        ("dwOffsetOfReadingSection", c_uint32),
        ("dwSizeOfReadingElement",   c_uint32),
        ("dwNumReadingElements",     c_uint32),
    ]

def open_shared_memory():
    k = ctypes.windll.kernel32
    k.OpenFileMappingW.restype = ctypes.c_void_p
    k.MapViewOfFile.restype    = ctypes.c_void_p
    k.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
    k.CloseHandle.argtypes     = [ctypes.c_void_p]
    h = k.OpenFileMappingW(0x0004, False, HWINFO_SENSORS_MAP_FILE_NAME)
    if not h:
        return None, None, None
    p = k.MapViewOfFile(h, 0x0004, 0, 0, 0)
    if not p:
        k.CloseHandle(h)
        return None, None, None
    return k, h, p

def read_snapshot(k, p):
    hdr = HWiNFO_SENSORS_SHARED_MEM2.from_address(p)

    sensors = {}
    for i in range(hdr.dwNumSensorElements):
        offset = p + hdr.dwOffsetOfSensorSection + i * hdr.dwSizeOfSensorElement
        s = HWiNFO_SENSORS_SENSOR_ELEMENT.from_address(offset)
        name = (s.szSensorNameUser or s.szSensorNameOrig).decode('latin-1', errors='replace').strip('\x00')
        sensors[i] = name

    readings = []
    for i in range(hdr.dwNumReadingElements):
        offset = p + hdr.dwOffsetOfReadingSection + i * hdr.dwSizeOfReadingElement
        r = HWiNFO_SENSORS_READING_ELEMENT.from_address(offset)
        label = (r.szLabelUser or r.szLabelOrig).decode('latin-1', errors='replace').strip('\x00')
        readings.append({
            "sensorName": sensors.get(r.dwSensorIndex, ""),
            "label":      label,
            "value":      r.Value,
            "type":       r.tReading,
        })

    def find(label_sub, rtype=None):
        ls = label_sub.lower()
        for r in readings:
            if ls not in r["label"].lower(): continue
            if rtype is not None and r["type"] != rtype: continue
            return r["value"]
        return None

    core_temps = []
    for r in readings:
        rl = r["label"].lower()
        if r["type"] == TYPE_TEMP and (rl.startswith("p-core") or rl.startswith("e-core")) and \
           not any(x in rl for x in ["distance","throttl","critical","power","clock","vid","limit","ratio","residency","utility","usage","c0","c1","c6"]):
            core_temps.append({"label": r["label"], "temp": r["value"]})

    return {
        "available": True,
        "cpu": {
            "tempAvg":     find("core temperatures (avg)", TYPE_TEMP),
            "packageTemp": find("cpu package", TYPE_TEMP),
            "power":       find("cpu package power", TYPE_POWER),
            "coreTemps":   core_temps,
        },
        "gpu": {
            "temp":            find("gpu temperature", TYPE_TEMP),
            "memJunctionTemp": find("gpu memory junction temperature", TYPE_TEMP),
            "load":            find("gpu core load", TYPE_USAGE),
            "memLoad":         find("gpu memory controller load", TYPE_USAGE),
            "memUsagePct":     find("gpu memory usage", TYPE_USAGE),
            "clockMhz":        find("gpu clock", TYPE_CLOCK),
            "memClockMhz":     find("gpu memory clock", TYPE_CLOCK),
            "power":           find("gpu core (nvvdd) output power", TYPE_POWER),
            "fanRpm":          find("gpu fan1", TYPE_FAN),
            "fanPct":          find("gpu fan1", TYPE_USAGE),
        },
        "fans": {
            "cpuFanRpm": find("cpu fan", TYPE_FAN),
        }
    }

def main():
    k, h, p = open_shared_memory()
    if not k:
        # Keep outputting unavailable until HWiNFO starts
        while True:
            print(json.dumps({"available": False}), flush=True)
            time.sleep(POLL_INTERVAL)
        return

    try:
        while True:
            try:
                data = read_snapshot(k, p)
            except Exception as e:
                data = {"available": False, "error": str(e)}
            print(json.dumps(data), flush=True)
            time.sleep(POLL_INTERVAL)
    finally:
        k.UnmapViewOfFile(p)
        k.CloseHandle(h)

if __name__ == "__main__":
    main()
