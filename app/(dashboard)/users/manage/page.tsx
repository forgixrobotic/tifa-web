"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

type User = {
  user_id: number;
  username: string;
  email: string;
  is_active: boolean;
  company_id: number | null;
  role_code: string | null;
  company_name: string | null;
};

type Company = {
  company_id: number;
  company_name: string;
};

export default function UserManagePage() {
  const { dict } = useLanguage();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch("/api/company");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCompanies(data.data);
          if (data.data.length > 0) {
            setSelectedCompanyId(data.data[0].company_id.toString());
          }
        }
      }
    } catch (err) {
      // Ignored: probably not a super_admin
    }
  };

  useEffect(() => {
    const init = async () => {
      setFetching(true);
      await Promise.all([fetchUsers(), fetchCompanies()]);
      setFetching(false);
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = { email, password };
      if (companies.length > 0) {
        if (!selectedCompanyId) throw new Error("Please select a target company");
        payload.companyId = Number(selectedCompanyId);
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register user");

      setSuccess(`User ${email} registered successfully as operator!`);
      setEmail("");
      setPassword("");
      fetchUsers(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: number, uEmail: string) => {
    if (!confirm(`Are you sure you want to delete user ${uEmail}?`)) return;
    
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      
      setSuccess(`Deleted user ${uEmail}`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setEditLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: editingUser.user_id, 
          isActive: editIsActive,
          password: editPassword || undefined // only send if changed
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      
      setSuccess(`Updated user ${editingUser.email}`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in h-full flex flex-col">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-txt-main flex items-center gap-2">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          User Management
        </h1>
        <p className="text-sm text-txt-sec mt-1">Register and manage Barista / Operator accounts.</p>
      </header>

      {error && (
        <div className="p-4 bg-rose-500/10 border-l-4 border-rose-500 text-rose-500 text-sm rounded-r-lg shadow-sm flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-500/10 border-l-4 border-emerald-500 text-emerald-500 text-sm rounded-r-lg shadow-sm flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Form Panel */}
        <div className="lg:col-span-4 h-fit">
          <div className="glass-panel rounded-2xl border border-border-base p-6 shadow-xl relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="p-2.5 bg-sidebar rounded-xl border border-border-base shadow-inner">
                <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
              </div>
              <h2 className="text-lg font-bold text-txt-main">New Operator</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              {companies.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Target Company</label>
                  <div className="relative">
                    <select
                      required
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>-- Select Company --</option>
                      {companies.map(c => (
                        <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-txt-sec">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">User Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="operator@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="Min. 6 characters"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] flex justify-center items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    Create User
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* List Panel */}
        <div className="lg:col-span-8">
          <div className="glass-panel rounded-2xl border border-border-base p-6 shadow-xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sidebar rounded-xl border border-border-base shadow-inner">
                  <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                </div>
                <h2 className="text-lg font-bold text-txt-main">Directory</h2>
              </div>
              <div className="text-xs font-medium text-txt-sec bg-sidebar px-3 py-1 rounded-full border border-border-base shadow-sm">
                Total: <span className="text-txt-main font-bold">{users.length}</span>
              </div>
            </div>

            {fetching ? (
              <div className="flex-1 flex flex-col gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-16 bg-sidebar rounded-xl w-full animate-pulse border border-border-base/50"></div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-sidebar flex items-center justify-center mb-4 border border-border-base">
                  <svg className="w-8 h-8 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                </div>
                <p className="text-txt-main font-bold">No Users Found</p>
                <p className="text-sm text-txt-sec mt-1">Register the first operator using the panel.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-base/50 text-xs font-bold uppercase tracking-wider text-txt-sec bg-sidebar/30">
                      <th className="p-3 rounded-tl-lg">Account</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Company</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right rounded-tr-lg">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {users.map((u) => (
                      <tr key={u.user_id} className="border-b border-border-base/30 last:border-0 hover:bg-white/[0.02] transition-colors group">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-border-base flex items-center justify-center text-txt-main font-bold text-xs shadow-inner uppercase">
                              {u.email.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-txt-main">{u.email}</p>
                              <p className="text-[10px] text-txt-sec">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded bg-[#0f172a] border border-border-base text-[10px] font-bold uppercase tracking-wider ${
                            u.role_code === 'super_admin' ? 'text-purple-400' :
                            u.role_code === 'admin' ? 'text-emerald-400' :
                            'text-blue-400'
                          }`}>
                            {u.role_code?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-txt-sec text-xs font-medium">
                          {u.company_name || '-'}
                        </td>
                        <td className="p-3">
                          <div className={`flex items-center gap-1.5 text-xs font-medium ${u.is_active ? 'text-emerald-500' : 'text-rose-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500 shadow-[0_0_5px_#f43f5e]'}`} />
                            {u.is_active ? 'Active' : 'Inactive'}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {/* Disable edit/delete if it's superadmin editing superadmin unless it's themselves maybe, or just let API handle it. UI allows for now. */}
                            <button 
                              onClick={() => {
                                setEditingUser(u);
                                setEditIsActive(u.is_active);
                                setEditPassword(""); // reset
                              }}
                              className="p-1.5 text-txt-sec hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/30"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            <button 
                              onClick={() => handleDelete(u.user_id, u.email)}
                              className="p-1.5 text-txt-sec hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditingUser(null)}>
          <div className="bg-[#0f172a] border border-border-base rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </div>
              <h3 className="text-lg font-bold text-txt-main">Edit User Settings</h3>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-5">
              
              <div className="p-3 rounded-xl bg-sidebar border border-border-base mb-2">
                <p className="text-xs text-txt-sec">Account</p>
                <p className="font-bold text-txt-main">{editingUser.email}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Account Status</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditIsActive(true)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-bold transition ${editIsActive ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'border-border-base text-txt-sec hover:bg-sidebar'}`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsActive(false)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-bold transition ${!editIsActive ? 'bg-rose-500/10 border-rose-500 text-rose-500' : 'border-border-base text-txt-sec hover:bg-sidebar'}`}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              <div className="h-px w-full bg-border-base/50 my-2"></div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider flex justify-between">
                  <span>New Password</span>
                  <span className="text-[10px] text-txt-sec/70 normal-case">(Leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border-base text-txt-sec font-semibold hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.2)]"
                >
                  {editLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
