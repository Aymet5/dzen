import React, { useEffect, useState } from 'react';
import { Users, Shield, Clock, CreditCard } from 'lucide-react';

interface User {
  id: number;
  username: string | null;
  first_name: string | null;
  trial_started_at: string;
  subscription_expires_at: string | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch users', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-indigo-600" />
            Панель управления ботом
          </h1>
          <p className="text-neutral-500 mt-2">
            Управление пользователями, подписками и конфигурациями
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-neutral-500" />
              Пользователи ({users.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-neutral-500 text-sm">
                  <th className="p-4 font-medium border-b border-neutral-200">ID</th>
                  <th className="p-4 font-medium border-b border-neutral-200">Имя</th>
                  <th className="p-4 font-medium border-b border-neutral-200">Username</th>
                  <th className="p-4 font-medium border-b border-neutral-200">Начало триала</th>
                  <th className="p-4 font-medium border-b border-neutral-200">Подписка до</th>
                  <th className="p-4 font-medium border-b border-neutral-200">Статус</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-500">
                      Пока нет пользователей. Запустите бота в Telegram!
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const now = new Date();
                    const trialStart = new Date(user.trial_started_at);
                    const trialEnd = new Date(trialStart.getTime() + 3 * 24 * 60 * 60 * 1000);
                    const subEnd = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
                    
                    let status = 'Истек';
                    let statusColor = 'bg-red-100 text-red-700';

                    if (subEnd && now < subEnd) {
                      status = 'Активна';
                      statusColor = 'bg-emerald-100 text-emerald-700';
                    } else if (now < trialEnd) {
                      status = 'Триал';
                      statusColor = 'bg-blue-100 text-blue-700';
                    }

                    return (
                      <tr key={user.id} className="hover:bg-neutral-50 border-b border-neutral-100">
                        <td className="p-4 font-mono text-neutral-600">{user.id}</td>
                        <td className="p-4 font-medium text-neutral-900">{user.first_name || '-'}</td>
                        <td className="p-4 text-neutral-600">{user.username ? `@${user.username}` : '-'}</td>
                        <td className="p-4 text-neutral-600 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-neutral-400" />
                          {new Date(user.trial_started_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-neutral-600">
                          {user.subscription_expires_at ? (
                            <span className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-neutral-400" />
                              {new Date(user.subscription_expires_at).toLocaleDateString()}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
