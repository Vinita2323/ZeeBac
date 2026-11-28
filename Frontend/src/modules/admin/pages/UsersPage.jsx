import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';

const STATUS_BADGE = {
  Active: 'bg-emerald-100 text-emerald-800',
  Suspended: 'bg-amber-100 text-amber-800',
  Banned: 'bg-rose-100 text-rose-800',
};

export default function UsersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch = queryParams.get('search') || '';

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getUsers(page, search, statusFilter);
      const formattedUsers = (res.data || []).map((u) => ({
        id: u.zeebacId,
        _id: u._id,
        name: u.name,
        phone: u.phone,
        email: u.email || '',
        city: u.location?.city || '',
        pincode: u.location?.pincode || '',
        walletBalance: u.walletBalance || 0,
        totalTransactions: u.totalTransactions || 0,
        totalOrders: u.totalOrders || 0,
        deliveredOrders: u.deliveredOrders || 0,
        cancelledOrders: u.cancelledOrders || 0,
        totalOrderSpend: u.totalOrderSpend || 0,
        totalReviews: u.totalReviews || 0,
        status: u.status || 'Active',
        joined: new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        createdAt: u.createdAt,
      }));
      setUsers(formattedUsers);
      setMeta(res.meta);
    } catch (error) {
      console.error('Failed to fetch users', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [page, search, statusFilter]);

  const handleQuickStatusToggle = async (user, e) => {
    e.stopPropagation();
    try {
      if (user.status === 'Active') {
        await AdminAPI.suspendUser(user._id);
        toast.success(`${user.name} deactivated`);
      } else {
        await AdminAPI.unsuspendUser(user._id);
        toast.success(`${user.name} activated`);
      }
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const handleExport = () => {
    if (!users || users.length === 0) return toast.error('No users to export.');

    const headers = [
      'User ID',
      'Name',
      'Phone',
      'Email',
      'City',
      'Total Orders',
      'Delivered',
      'Cancelled',
      'Total Spend',
      'Wallet Balance',
      'Reviews',
      'Status',
      'Joined',
    ];
    const rows = users.map((u) => [
      u.id,
      u.name,
      u.phone,
      u.email,
      u.city,
      u.totalOrders,
      u.deliveredOrders,
      u.cancelledOrders,
      u.totalOrderSpend,
      u.walletBalance,
      u.totalReviews,
      u.status,
      u.joined,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const displayedUsers = [...users].sort((a, b) => {
    if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'orders_desc') return b.totalOrders - a.totalOrders;
    if (sortBy === 'spend_desc') return b.totalOrderSpend - a.totalOrderSpend;
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return (
    <div className="space-y-5 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">User Management</h1>
          <p className="text-body-md text-on-surface-variant">
            Click any user to open their full behavior profile, orders, reviews, and moderation controls
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              type="text"
              placeholder="Search name, phone, ID..."
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              className="w-full sm:w-52 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-primary transition-all duration-300"
            />
          </div>

          <div className="relative w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">
              sort
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl pl-9 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="orders_desc">Most Orders</option>
              <option value="spend_desc">Highest Spend</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="status">Status</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px] pointer-events-none">
              expand_more
            </span>
          </div>

          <button
            onClick={handleExport}
            className="h-10 px-4 bg-primary/10 text-primary rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-colors shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: '', label: 'All Users' },
          { value: 'Active', label: 'Active' },
          { value: 'Suspended', label: 'Deactivated' },
          { value: 'Banned', label: 'Blocked' },
        ].map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            onClick={() => {
              setPage(1);
              setStatusFilter(tab.value);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              statusFilter === tab.value
                ? 'bg-[#7c3aed] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-3.5 font-bold">User</th>
                <th className="p-3.5 font-bold">Contact &amp; Location</th>
                <th className="p-3.5 font-bold">Wallet Balance</th>
                <th className="p-3.5 font-bold">Joined</th>
                <th className="p-3.5 font-bold">Status</th>
                <th className="p-3.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs font-bold text-slate-400">
                    Loading users…
                  </td>
                </tr>
              ) : displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                displayedUsers.map((user) => (
                  <tr
                    key={user._id || user.id}
                    onClick={() => navigate(`/admin/users/${user._id}`)}
                    className="border-b border-outline-variant/5 hover:bg-purple-50/40 transition-colors text-[13px] cursor-pointer"
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-[#7c3aed] font-black text-sm flex items-center justify-center shrink-0">
                          {(user.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-on-surface truncate max-w-[180px]">{user.name}</p>
                          <p className="font-mono text-[11px] text-on-surface-variant">{user.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <p className="font-mono font-semibold text-slate-800">{user.phone}</p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[190px]">
                        {user.email || [user.city, user.pincode].filter(Boolean).join(' ') || '—'}
                      </p>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <p className="font-mono font-bold text-[#7c3aed]">{user.walletBalance.toLocaleString('en-IN')} Pts</p>
                    </td>

                    <td className="p-3.5 text-on-surface-variant text-xs whitespace-nowrap">{user.joined}</td>

                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                          STATUS_BADGE[user.status] || STATUS_BADGE.Active
                        }`}
                      >
                        {user.status === 'Suspended' ? 'Deactivated' : user.status === 'Banned' ? 'Blocked' : 'Active'}
                      </span>
                    </td>

                    <td onClick={(e) => e.stopPropagation()} className="p-3.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        onClick={() => navigate(`/admin/users/${user._id}`)}
                        className="px-3 py-1.5 bg-[#7c3aed] text-white font-bold text-[12px] rounded-lg hover:bg-[#6d28d9] transition-colors cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => handleQuickStatusToggle(user, e)}
                        className={`px-2.5 py-1.5 font-bold text-[12px] rounded-lg transition-colors cursor-pointer ${
                          user.status === 'Active'
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-outline-variant/10 flex items-center justify-between text-[13px] text-on-surface-variant">
          <span>
            Showing {users?.length || 0} of {meta?.total || 0} entries
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded border border-outline-variant/20 flex items-center justify-center hover:bg-surface-container-low disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded bg-primary text-white flex items-center justify-center font-bold">{page}</button>
            <button
              onClick={() => setPage((p) => (meta?.totalPages > p ? p + 1 : p))}
              disabled={page >= (meta?.totalPages || 1)}
              className="w-8 h-8 rounded border border-outline-variant/20 flex items-center justify-center hover:bg-surface-container-low disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
