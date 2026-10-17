import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('linux_sensors', pathlib.Path(__file__).parents[1] / 'backend/src/linux_sensors.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

class SensorsTest(unittest.TestCase):
    def test_cpu_gpu_units_and_missing_fields(self):
        def command(args):
            if args[0] == 'sensors':
                return '{"coretemp-isa-0000":{"Package id 0":{"temp1_input":43},"Core 0":{"temp2_input":38},"Core 4":{"temp3_input":36}},"acpitz":{"temp1":{"temp1_input":99}}}'
            return 'NVIDIA GeForce RTX 5070, 39, 6, 4, 2142, 12227, 2520, 14001, 34, 250, 30\n'
        with patch.object(reader, 'command', side_effect=command), patch.object(reader.glob, 'glob', return_value=[]):
            data = reader.collect()
        self.assertTrue(data['available'])
        self.assertEqual(data['cpu']['packageTemp'], 43)
        self.assertEqual(data['cpu']['tempAvg'], 37)
        self.assertEqual(data['gpu']['memUsed'], 2142 * 1024 * 1024)
        self.assertEqual(data['gpu']['powerLimit'], 250)
        self.assertIsNone(data['gpu']['fanRpm'])
        self.assertEqual(data['cpu']['coreEffective'], [])

    def test_absent_tools_and_unsupported_nvidia_values(self):
        with patch.object(reader, 'command', return_value=''), patch.object(reader.glob, 'glob', return_value=[]):
            data = reader.collect()
        self.assertFalse(data['available'])
        self.assertIsNone(data['gpu']['load'])
        self.assertIsNone(reader.number('[N/A]'))
        self.assertIsNone(reader.number('nan'))

if __name__ == '__main__':
    unittest.main()
