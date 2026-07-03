import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getUsers(page, search);
      const formattedUsers = res.data.map(u => ({
        id: u.zeebacId,
        _id: u._id,
        name: u.name,
        phone: u.phone,
        aadhaar: 'XXXX-XXXX-XXXX', // From admin view
        status: u.status,
        joined: new Date(u.createdAt).toLocaleDateString()
      }));
      setUsers(formattedUsers);
      setMeta(res.meta);
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const handleToggleStatus = async (user) => {
    try {
      if (user.status === 'Active') {
        await AdminAPI.suspendUser(user._id);
      } else {
        await AdminAPI.unsuspendUser(user._id);
      }
      fetchUsers();
    } catch (error) {
      alert("Action failed");
    }
  };

  let displayedUsers = [...users].filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.phone.includes(search)
  );

  displayedUsers.sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    return 0;
  });



  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">User Management</h1>
          <p className="text-body-md text-on-surface-variant">Manage customer accounts and statuses</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">sort</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl pl-9 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="status">Status</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px] pointer-events-none">expand_more</span>
          </div>

          <button className="h-10 px-4 bg-primary text-white rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shrink-0 w-full sm:w-auto">
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="sm:inline">Export</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-4 font-bold">User ID</th>
                <th className="p-4 font-bold">Name</th>
                <th className="p-4 font-bold">Phone Number</th>
                <th className="p-4 font-bold">Aadhaar (KYC)</th>
                <th className="p-4 font-bold">Joined Date</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.map((user) => (
                <tr key={user.id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4 font-mono text-on-surface-variant">{user.id}</td>
                  <td className="p-4 font-bold text-on-surface">{user.name}</td>
                  <td className="p-4 text-on-surface-variant">{user.phone}</td>
                  <td className="p-4 text-on-surface-variant">{user.aadhaar}</td>
                  <td className="p-4 text-on-surface-variant">{user.joined}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide
                      ${user.status === 'Active' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}
                    `}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2">
                    <button className="px-3 py-1 bg-primary/10 text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors cursor-pointer">
                      View
                    </button>
                    <button 
                      onClick={() => handleToggleStatus(user)}
                      className={`px-3 py-1 font-bold text-[12px] rounded-lg transition-colors cursor-pointer
                      ${user.status === 'Active' ? 'bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white' : 'bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white'}
                    `}>
                      {user.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-outline-variant/10 flex items-center justify-between text-[13px] text-on-surface-variant">
          <span>Showing {users.length} of {meta?.total || 0} entries</span>
          <div className="flex gap-1">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded border border-outline-variant/20 flex items-center justify-center hover:bg-surface-container-low disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded bg-primary text-white flex items-center justify-center font-bold">{page}</button>
            <button 
              onClick={() => setPage(p => (meta?.totalPages > p ? p + 1 : p))}
              disabled={page === (meta?.totalPages || 1)}
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
