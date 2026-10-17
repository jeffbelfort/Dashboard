"""Linux sensor bridge. Emits the existing dashboard JSON schema once per second.
No root access required; unavailable fields remain null/empty.
"""
import csv
import glob
import json
import os
import subprocess
import sys
import time


def number(value):
    try:
        value = float(value)
        return value if value == value and abs(value) != float('inf') else None
    except (TypeError, ValueError):
        return None


def command(args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=3, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        return ''


def collect():
    cpu = dict(tempAvg=None, packageTemp=None, power=None, coreTemps=[], coreClocks=[],
               coreRatios=[], coreVids=[], coreEffective=[], vcore=None, pchTemp=None)
    gpu = dict(temp=None, memJunctionTemp=None, load=None, memLoad=None, memUsagePct=None,
               clockMhz=None, memClockMhz=None, power=None, fanRpm=None, fanPct=None,
               coreVoltage=None, model=None, memUsed=None, memTotal=None, powerLimit=None)
    fans = dict(cpuFanRpm=None)
    try:
        readings = json.loads(command(['sensors', '-j']) or '{}')
    except ValueError:
        readings = {}
    packages = []
    for chip, features in readings.items():
        if not isinstance(features, dict):
            continue
        # Avoid labelling NIC/ACPI temperatures as CPU temperatures.
        if not chip.startswith(('coretemp-', 'k10temp-', 'zenpower-')):
            continue
        for label, values in features.items():
            if not isinstance(values, dict):
                continue
            temps = [number(v) for k, v in values.items() if k.startswith('temp') and k.endswith('_input')]
            temps = [v for v in temps if v is not None]
            if not temps:
                continue
            if label.startswith('Core '):
                cpu['coreTemps'].append(dict(label=label, temp=temps[0]))
            elif label.startswith('Package') or label in ('Tctl', 'Tdie'):
                packages.append(temps[0])
    cpu['packageTemp'] = max(packages) if packages else None
    if cpu['coreTemps']:
        cpu['tempAvg'] = sum(t['temp'] for t in cpu['coreTemps']) / len(cpu['coreTemps'])
    else:
        cpu['tempAvg'] = cpu['packageTemp']

    # These are per-logical-CPU sampled clocks, not HWiNFO effective clocks.
    for directory in sorted(glob.glob('/sys/devices/system/cpu/cpu[0-9]*'), key=lambda p: int(p.rsplit('cpu', 1)[1])):
        try:
            with open(os.path.join(directory, 'cpufreq/scaling_cur_freq')) as f:
                mhz = number(f.read())
            if mhz is not None:
                cpu['coreClocks'].append(dict(label='CPU ' + directory.rsplit('cpu', 1)[1], mhz=mhz / 1000))
        except OSError:
            pass
    fields = ['name', 'temperature.gpu', 'utilization.gpu', 'utilization.memory',
              'memory.used', 'memory.total', 'clocks.gr', 'clocks.mem', 'power.draw', 'power.limit', 'fan.speed']
    output = command(['nvidia-smi', '--query-gpu=' + ','.join(fields), '--format=csv,noheader,nounits'])
    rows = list(csv.reader(output.splitlines()))
    if rows and len(rows[0]) == len(fields):
        row = [v.strip() for v in rows[0]]
        gpu['model'] = row[0]
        keys = ['temp', 'load', 'memLoad', 'memUsed', 'memTotal', 'clockMhz', 'memClockMhz', 'power', 'powerLimit', 'fanPct']
        for key, value in zip(keys, row[1:]):
            gpu[key] = number(value)
        if gpu['memTotal'] and gpu['memUsed'] is not None:
            gpu['memUsagePct'] = gpu['memUsed'] / gpu['memTotal'] * 100
        # nvidia-smi reports MiB; dashboard metadata uses bytes.
        for key in ('memUsed', 'memTotal'):
            if gpu[key] is not None:
                gpu[key] *= 1024 * 1024
    available = cpu['packageTemp'] is not None or bool(cpu['coreTemps']) or gpu['model'] is not None
    return dict(available=available, source='linux', cpu=cpu, gpu=gpu, fans=fans)


if __name__ == '__main__':
    while True:
        started = time.monotonic()
        try:
            print(json.dumps(collect(), allow_nan=False), flush=True)
        except BrokenPipeError:
            break
        except Exception as error:
            print('Linux sensor bridge: ' + str(error), file=sys.stderr, flush=True)
        if '--once' in sys.argv:
            break
        time.sleep(max(0, 1 - (time.monotonic() - started)))
