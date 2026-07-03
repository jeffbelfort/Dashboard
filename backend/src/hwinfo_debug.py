import sys
import traceback

try:
    import ctypes
    import json
    from ctypes import Structure, c_uint32, c_double, c_char, c_longlong

    HWINFO_SENSORS_MAP_FILE_NAME = "Global\\HWiNFO_SENS_SM2"
    HWINFO_SENSORS_STRING_LEN = 128
    HWINFO_UNIT_STRING_LEN = 16

    class HWiNFO_SENSORS_READING_ELEMENT(Structure):
        _pack_ = 1
        _fields_ = [
            ("tReading",      c_uint32),
            ("dwSensorIndex", c_uint32),
            ("dwReadingID",   c_uint32),
            ("szLabelOrig",   c_char * HWINFO_SENSORS_STRING_LEN),
            ("szLabelUser",   c_char * HWINFO_SENSORS_STRING_LEN),
            ("szUnit",        c_char * HWINFO_UNIT_STRING_LEN),
            ("Value",         c_double),
            ("ValueMin",      c_double),
            ("ValueMax",      c_double),
            ("ValueAvg",      c_double),
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

    k = ctypes.windll.kernel32
    h = k.OpenFileMappingW(0x0004, False, HWINFO_SENSORS_MAP_FILE_NAME)
    print(f"Handle: {h}", flush=True)
    
    p = k.MapViewOfFile(h, 0x0004, 0, 0, 0)
    print(f"Mapped: {p}", flush=True)
    
    hdr = HWiNFO_SENSORS_SHARED_MEM2.from_address(p)
    print(f"Sensors: {hdr.dwNumSensorElements}, Readings: {hdr.dwNumReadingElements}", flush=True)
    print(f"Sig: {hex(hdr.dwSignature)}", flush=True)

    readings = []
    for i in range(min(hdr.dwNumReadingElements, 5)):
        offset = p + hdr.dwOffsetOfReadingSection + i * hdr.dwSizeOfReadingElement
        r = HWiNFO_SENSORS_READING_ELEMENT.from_address(offset)
        label = r.szLabelUser.decode('utf-8', errors='replace').strip('\x00') or r.szLabelOrig.decode('utf-8', errors='replace').strip('\x00')
        print(f"Reading {i}: {label} = {r.Value} {r.szUnit.decode('utf-8', errors='replace').strip(chr(0))}", flush=True)

    k.UnmapViewOfFile(p)
    k.CloseHandle(h)

except Exception as e:
    print(f"ERROR: {e}", flush=True)
    traceback.print_exc()
