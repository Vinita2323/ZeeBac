import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdminAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

const input =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[14px] text-slate-900 focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed]/15 focus:outline-none';
const label = 'block text-[12px] font-semibold text-slate-600 mb-1.5';
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className={`${input} pr-11`} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
        <span className="material-symbols-outlined text-[19px]">{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  );
}

export default function AdminProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', currentPassword: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    AdminAPI.getMyProfile()
      .then((r) => {
        setProfile(r.data);
        setForm({ name: r.data.name || '', email: r.data.email || '', phone: r.data.phone || '', currentPassword: '' });
      })
      .catch((e) => toast.error(e.response?.data?.message || 'Could not load profile'));
  }, []);

  if (!profile) return <div className="p-6 text-sm text-slate-500">Loading profile…</div>;

  const emailChanged = form.email.trim().toLowerCase() !== (profile.email || '');
  const dirty = form.name !== profile.name || emailChanged || form.phone !== (profile.phone || '');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await AdminAPI.updateMyProfile({
        name: form.name,
        phone: form.phone,
        email: form.email,
        ...(emailChanged ? { currentPassword: form.currentPassword } : {}),
      });
      setProfile(r.data);
      setForm({ name: r.data.name, email: r.data.email, phone: r.data.phone || '', currentPassword: '' });
      // keep the name shown across the admin panel in sync
      const st = useAuthStore.getState();
      const updatedAdmin = { ...(st.adminUser || {}), name: r.data.name, email: r.data.email };
      useAuthStore.setState({
        adminUser: updatedAdmin,
        ...(st.currentUser && st.currentUser._id === updatedAdmin._id ? { currentUser: { ...st.currentUser, name: r.data.name } } : {}),
      });
      try {
        localStorage.setItem('zeebac_admin_user', JSON.stringify(updatedAdmin));
      } catch {
        /* storage unavailable */
      }
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  const strong = pw.newPassword.length >= 8 && /[A-Za-z]/.test(pw.newPassword) && /\d/.test(pw.newPassword);
  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast.error('New passwords do not match');
    setChanging(true);
    try {
      const r = await AdminAPI.changeMyPassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success(r.message || 'Password changed');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setProfile((p) => ({ ...p, passwordChangedAt: new Date().toISOString() }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#7c3aed] text-white flex items-center justify-center text-2xl font-black shrink-0">
          {(profile.name || 'A').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-black text-slate-900 truncate">{profile.name}</h1>
          <p className="text-[13px] text-slate-500 truncate">{profile.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11.5px]">
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-[#7c3aed] font-bold uppercase">{profile.role?.replace('_', ' ')}</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">Last login {when(profile.lastLoginAt)}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Account details */}
        <form onSubmit={saveProfile} className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-4">
          <div>
            <h2 className="font-black text-[16px] text-slate-900">Account details</h2>
            <p className="text-[12.5px] text-slate-500">Your name and contact details in the admin panel.</p>
          </div>
          <div>
            <label className={label}>Full name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={60} />
          </div>
          <div>
            <label className={label}>Login email</label>
            <input type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
          </div>
          <div>
            <label className={label}>Mobile number</label>
            <input className={input} inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} placeholder="10-digit number" />
          </div>
          {emailChanged && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
              <p className="text-[12px] text-amber-900">Changing your login email needs your current password. You will use the new email to sign in.</p>
              <PasswordInput value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} placeholder="Current password" autoComplete="current-password" />
            </div>
          )}
          <button disabled={!dirty || saving || (emailChanged && !form.currentPassword)} className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#7c3aed] text-white font-bold text-[13.5px] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        {/* Password */}
        <form onSubmit={changePassword} className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 space-y-4">
          <div>
            <h2 className="font-black text-[16px] text-slate-900">Change password</h2>
            <p className="text-[12.5px] text-slate-500">Last changed {when(profile.passwordChangedAt)}</p>
          </div>
          <div>
            <label className={label}>Current password</label>
            <PasswordInput value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
          </div>
          <div>
            <label className={label}>New password</label>
            <PasswordInput value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
            {pw.newPassword && (
              <p className={`text-[11.5px] mt-1 ${strong ? 'text-emerald-600' : 'text-slate-500'}`}>
                {strong ? '✓ Strong enough' : 'At least 8 characters, with letters and numbers'}
              </p>
            )}
          </div>
          <div>
            <label className={label}>Confirm new password</label>
            <PasswordInput value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            {pw.confirm && pw.confirm !== pw.newPassword && <p className="text-[11.5px] mt-1 text-rose-600">Passwords do not match</p>}
          </div>
          <button
            disabled={changing || !pw.currentPassword || !strong || pw.newPassword !== pw.confirm}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-[13.5px] disabled:opacity-50"
          >
            {changing ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
