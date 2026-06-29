'use client';

import { useEffect, useState } from 'react';
import Widget from './Widget';

export default function ClockWidget() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-GB', { hour12: false }));
      setDate(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <Widget title="CLOCK" accent="#8bc88b">
      <div className="flex flex-col items-center justify-center py-2">
        <div className="text-4xl text-[#4ade80] tracking-widest tabular-nums" style={{ textShadow: '0 0 10px #4ade8060' }}>
          {time}
        </div>
        <div className="text-xs text-[#3a5a3a] tracking-widest mt-2 uppercase">{date}</div>
      </div>
    </Widget>
  );
}
