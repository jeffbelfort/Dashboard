import Widget from './Widget';

interface WeatherData {
  temp: number;
  feelsLike: number;
  humidity: number;
  windspeed: number;
  weatherCode: number;
  description: string;
}

const WEATHER_ICONS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export default function WeatherWidget({ data }: { data: WeatherData | null }) {
  if (!data) {
    return (
      <Widget title="WEATHER // SHEFFIELD" accent="#fbbf24">
        <div className="text-[#3a5a3a] text-xs tracking-widest text-center py-4">FETCHING...</div>
      </Widget>
    );
  }

  const icon = WEATHER_ICONS[data.weatherCode] ?? '🌡️';

  return (
    <Widget title="WEATHER // SHEFFIELD" accent="#fbbf24">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-3xl text-[#fbbf24]" style={{ textShadow: '0 0 8px #fbbf2460' }}>
            {Math.round(data.temp)}°C
          </div>
          <div className="text-xs text-[#3a5a3a] tracking-widest mt-1 uppercase">{data.description}</div>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#1e2e1e]">
        <div className="text-center">
          <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">FEELS</div>
          <div className="text-sm text-[#c8a850]">{Math.round(data.feelsLike)}°</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">HUMID</div>
          <div className="text-sm text-[#c8a850]">{data.humidity}%</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">WIND</div>
          <div className="text-sm text-[#c8a850]">{Math.round(data.windspeed)}mph</div>
        </div>
      </div>
    </Widget>
  );
}
