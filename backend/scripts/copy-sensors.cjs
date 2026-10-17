const fs = require('fs');
const path = require('path');
for (const file of ['hwinfo_reader.py', 'linux_sensors.py']) {
  fs.copyFileSync(path.join(__dirname, '../src', file), path.join(__dirname, '../dist', file));
}
