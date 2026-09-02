"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

type Company = {
  company_id: number;
  company_code: string;
  company_name: string;
  created_at: string;
};

export default function CompanyManagePage() {
  const { dict } = useLanguage();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fetching, setFetching] = useState(true);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const fetchCompanies = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/company");
      const data = await res.json();
      if (data.success) {
        setCompanies(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name, companyCode: code || undefined, adminEmail: email, adminPassword: password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register company");
      }

      setSuccess(`Company ${name} registered successfully! Admin user created.`);
      setName("");
      setCode("");
      setEmail("");
      setPassword("");
      fetchCompanies();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, cname: string) => {
    if (!confirm(`Are you sure you want to delete ${cname}? This may cascade and delete associated users/data.`)) return;
    
    try {
      const res = await fetch("/api/company", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      
      setSuccess(`Deleted company ${cname}`);
      fetchCompanies();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    
    setEditLoading(true);
    try {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: editingCompany.company_id, companyName: editName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      
      setSuccess(`Updated company to ${editName}`);
      setEditingCompany(null);
      fetchCompanies();
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
          <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          Company Management
        </h1>
        <p className="text-sm text-txt-sec mt-1">Register and manage client companies & their administrative accounts.</p>
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
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="p-2.5 bg-sidebar rounded-xl border border-border-base shadow-inner">
                <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              </div>
              <h2 className="text-lg font-bold text-txt-main">New Company</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Company Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="e.g. Forgix Robotics"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider flex justify-between">
                  <span>Company Code</span>
                  <span className="text-[10px] text-txt-sec/70 normal-case">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-txt-sec/50 font-mono"
                  placeholder="e.g. FGX_01"
                />
              </div>

              <div className="h-px w-full bg-border-base/50 my-2"></div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Admin Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="admin@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Admin Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-page border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all placeholder:text-txt-sec/50"
                  placeholder="Min. 6 characters"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] flex justify-center items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    Register Company
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
                  <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                </div>
                <h2 className="text-lg font-bold text-txt-main">Directory</h2>
              </div>
              <div className="text-xs font-medium text-txt-sec bg-sidebar px-3 py-1 rounded-full border border-border-base shadow-sm">
                Total: <span className="text-txt-main font-bold">{companies.length}</span>
              </div>
            </div>

            {fetching ? (
              <div className="flex-1 flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-sidebar rounded-xl w-full animate-pulse border border-border-base/50"></div>
                ))}
              </div>
            ) : companies.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-sidebar flex items-center justify-center mb-4 border border-border-base">
                  <svg className="w-8 h-8 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                </div>
                <p className="text-txt-main font-bold">No Companies Found</p>
                <p className="text-sm text-txt-sec mt-1">Register the first company using the panel.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-base/50 text-xs font-bold uppercase tracking-wider text-txt-sec bg-sidebar/30">
                      <th className="p-3 rounded-tl-lg">Company</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Joined</th>
                      <th className="p-3 text-right rounded-tr-lg">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {companies.map((c) => (
                      <tr key={c.company_id} className="border-b border-border-base/30 last:border-0 hover:bg-white/[0.02] transition-colors group">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-border-base flex items-center justify-center text-txt-main font-bold text-xs shadow-inner">
                              {c.company_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-txt-main">{c.company_name}</p>
                              <p className="text-[10px] text-txt-sec">ID: {c.company_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-1 rounded bg-[#0f172a] border border-border-base text-[11px] font-mono font-medium text-blue-400">
                            {c.company_code}
                          </span>
                        </td>
                        <td className="p-3 text-txt-sec text-xs font-medium">
                          {new Date(c.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingCompany(c);
                                setEditName(c.company_name);
                              }}
                              className="p-1.5 text-txt-sec hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/30"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            <button 
                              onClick={() => handleDelete(c.company_id, c.company_name)}
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
      {editingCompany && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditingCompany(null)}>
          <div className="bg-[#0f172a] border border-border-base rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </div>
              <h3 className="text-lg font-bold text-txt-main">Edit Company</h3>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-txt-sec uppercase tracking-wider">Company Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-sidebar border border-border-base rounded-xl px-4 py-2.5 text-sm text-txt-main focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border-base text-txt-sec font-semibold hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50 flex justify-center items-center gap-2"
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
