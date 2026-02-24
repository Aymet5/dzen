import React, { useEffect, useState } from 'react';
import { Shield, Zap, CheckCircle, Clock } from 'lucide-react';

export default function MiniApp() {
  const [tg, setTg] = useState<any>(null);

  useEffect(() => {
    // @ts-ignore
    if (window.Telegram?.WebApp) {
      // @ts-ignore
      const webApp = window.Telegram.WebApp;
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor('#F3F4F6'); // neutral-100
      setTg(webApp);
    }
  }, []);

  const handleGetConfig = () => {
    if (tg) {
      tg.sendData(JSON.stringify({ action: 'get_config' }));
      tg.close();
    } else {
      alert('Эта функция работает только внутри Telegram');
    }
  };

  const handlePay = () => {
    if (tg) {
      tg.sendData(JSON.stringify({ action: 'pay_sub' }));
      tg.close();
    } else {
      alert('Эта функция работает только внутри Telegram');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans p-6 flex flex-col">
      <div className="flex-1 max-w-md mx-auto w-full flex flex-col">
        
        {/* Header */}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
            <Shield className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-800">Dzen VPN</h1>
          <p className="text-neutral-500 mt-2 text-sm">Твой спокойный и безопасный интернет</p>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-neutral-700">Статус</h2>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wider">
              Активен
            </span>
          </div>
          <div className="flex items-center gap-3 text-neutral-600 text-sm">
            <Clock className="w-5 h-5 text-emerald-500" />
            <span>Пробный период (осталось 3 дня)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4 mt-auto">
          <button 
            onClick={handleGetConfig}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Zap className="w-5 h-5" />
            Получить конфигурацию
          </button>
          
          <button 
            onClick={handlePay}
            className="w-full bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 font-medium py-4 rounded-2xl transition-colors border border-neutral-200 flex items-center justify-center gap-2"
          >
            Продлить подписку
          </button>
        </div>

        <div className="text-center mt-8 text-xs text-neutral-400">
          <p>Поддержка: @dzen17vpn</p>
        </div>

      </div>
    </div>
  );
}
