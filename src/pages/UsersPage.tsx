import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Check, Pencil, ShieldCheck, Unlock } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa } from '../lib/format'
import type { AdminUser, Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useAuth } from '../lib/authContext'
import { can, isOwnerAdmin } from '../lib/permissions'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

export default function UsersPage() {
  const { user: panelUser } = useAuth()
  const owner = isOwnerAdmin(panelUser)
  const canEdit = can(panelUser, 'users.edit')
  const canBan = can(panelUser, 'users.ban')
  const canArtistBan = can(panelUser, 'artists.ban')
  const canBanFromUsers = (account:AdminUser) => canBan && (!account.roles?.includes('artist') || canArtistBan)
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [roleFilter, setRoleFilter] = useState(() => params.get('role') === 'employee' ? 'employee' : 'audience')
  const [state, setState] = useState(() => params.get('state') || '')
  const [plan, setPlan] = useState(() => params.get('plan') || '')
  const [sort, setSort] = useState('time')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)
  const q = useDebouncedValue(search)
  const toast = useToast()
  const employeeList = owner && roleFilter === 'employee'
  const path = '/admin/users/' + queryString({ role:employeeList?'employee':'audience', q, state, plan:employeeList?'':plan, sort, direction, page, page_size:20 })
  const remote = useRemote<Paginated<AdminUser>>(path)
  const rows = remote.data?.results || []

  const [draft, setDraft] = useState<{first_name:string;last_name:string;email:string;stream_quality:string} | null>(null)
  function openEdit(user: AdminUser) { setSelected(user); setDraft({ first_name:user.first_name || '', last_name:user.last_name || '', email:user.email || '', stream_quality:user.stream_quality }) }
  const visibleInCurrentList=(user:AdminUser)=>state===''||(state==='active'&&user.is_active&&!user.is_banned)||(state==='banned'&&user.is_banned)
  const verifyUser=(user:AdminUser,snapshot=pageSnapshot(remote.data,user.id),refreshPage=false,expect?:boolean|'saved')=>{
    void verifyExactEntity<AdminUser>(`/admin/users/${user.id}/`,{
      found:server=>remote.setData(current=>setPaginatedItem(current,server,{visible:visibleInCurrentList(server),indexHint:snapshot.index})),
      missing:()=>remote.setData(current=>removePaginatedItem(current,user.id)),
    },expect==='saved'?{stopWhenFound:server=>mutationFieldsMatch(server,user,['first_name','last_name','email','stream_quality'])}:typeof expect==='boolean'?{stopWhenFound:server=>server.is_banned===expect}:{}).then(outcome=>{if(refreshPage&&outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
  }
  async function saveEdit() {
    if (!selected || !draft) return
    const target=selected
    setBusy(true)
    const snapshot=pageSnapshot(remote.data,target.id)
    try { const response=await api<AdminUser>(`/admin/users/${target.id}/`, { method:'PATCH', body:jsonBody(draft) }); const updated:AdminUser={...response,...draft,stream_quality:draft.stream_quality as AdminUser['stream_quality']}; remote.setData(current=>setPaginatedItem(current,updated,{visible:visibleInCurrentList(updated),indexHint:snapshot.index})); toast.show('اطلاعات کاربر ذخیره شد.', 'success'); setSelected(null); verifyUser(updated,snapshot,true,'saved') }
    catch (err) { toast.show(errorMessageFa(err), 'error') } finally { setBusy(false) }
  }
  async function toggleBan() {
    if (!banTarget) return
    const target=banTarget; const snapshot=pageSnapshot(remote.data,target.id); const nextBanned=!target.is_banned
    setBusy(true)
    try { const result=await api<{user:AdminUser}>('/admin/users/ban/', { method:'POST', body:jsonBody({ user_id:target.id, banned:nextBanned }) }); const updated={...target,...(result.user||{}),is_banned:nextBanned,is_active:!nextBanned}; remote.setData(current=>setPaginatedItem(current,updated,{visible:visibleInCurrentList(updated),indexHint:snapshot.index})); toast.show(target.is_banned ? 'مسدودی کاربر برداشته شد.' : 'کاربر بدون حذف اطلاعات مسدود شد.', 'success'); setBanTarget(null); verifyUser(updated,snapshot,true,nextBanned) }
    catch (err) { toast.show(errorMessageFa(err), 'error') } finally { setBusy(false) }
  }

  return <div className="page-stack">
    <PageHeader title="مدیریت کاربران" description={(canEdit||canBan)?"جستجو، بررسی و مدیریت حساب کاربران":"جستجو و مرور حساب کاربران"} />
    <Card className="toolbar-card"><SearchBox value={search} onChange={value => { setSearch(value); setPage(1) }} placeholder="نام، شماره همراه یا ایمیل" /><div className="filters">{owner&&<ProductSelect ariaLabel="نوع حساب" value={roleFilter} onValueChange={value=>{setRoleFilter(value);setState('');setPlan('');setPage(1)}} options={[{value:'audience',label:'کاربران'},{value:'employee',label:'کارمندان'}]}/>}<ProductSelect ariaLabel="فیلتر وضعیت کاربران" value={state} onValueChange={value=>{setState(value);setPage(1)}} options={employeeList?[{value:'',label:'همه وضعیت‌ها'},{value:'active',label:'فعال'},{value:'inactive',label:'غیرفعال'}]:[{value:'',label:'همه وضعیت‌ها'},{value:'active',label:'فعال'},{value:'banned',label:'مسدود'}]}/>{!employeeList&&<ProductSelect ariaLabel="فیلتر پلن کاربران" value={plan} onValueChange={value=>{setPlan(value);setPage(1)}} options={[{value:'',label:'همه پلن‌ها'},{value:'free',label:'رایگان'},{value:'premium',label:'پریمیوم'}]}/>}<ProductSelect ariaLabel="مرتب‌سازی کاربران" value={`${sort}:${direction}`} onValueChange={value=>{const[s,d]=value.split(':');setSort(s);setDirection(d);setPage(1)}} options={[{value:'time:desc',label:'جدیدترین'},{value:'time:asc',label:'قدیمی‌ترین'},{value:'name:asc',label:'نام از الف'},{value:'name:desc',label:'نام از ی'}]}/></div></Card>
    <Card>{remote.error ? <ErrorState message={remote.error} retry={() => void remote.reload()} /> : <><DataTable<AdminUser> loading={remote.loading} rows={rows} columns={[
      { key:'user', title:'کاربر', render:u => <div className="person-cell"><span className="avatar">{u.first_name?.[0] || 'ک'}</span><div><strong>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'بدون نام'}</strong><span dir="ltr">{u.phone_number}</span></div></div> },
      { key:'plan', title:employeeList?'عنوان':'پلن', render:u => employeeList ? <span>{u.roles?.includes('manager')?'مدیر':'سرپرست'}</span> : <StatusBadge value={u.plan} tone={u.plan === 'premium' ? 'success' : 'neutral'} /> },
      { key:'state', title:'حساب', render:u => <StatusBadge value={u.is_banned ? 'banned' : 'active'} /> },
      { key:'verified', title:'تأیید', render:u => <div className="verification-stack"><span className={u.is_verified ? 'verified' : 'muted'}>{u.is_verified && <Check size={15}/>}شماره: {u.is_verified ? 'تأیید شده' : 'تأیید نشده'}</span>{u.has_artist_profile && <span className={u.artist_verified ? 'verified' : 'muted'}>{u.artist_verified && <Check size={15}/>}هنرمند: {u.artist_verified ? 'تأیید شده' : 'در انتظار تأیید'}</span>}</div> },
      { key:'joined', title:'عضویت', render:u => dateTimeFa(u.date_joined) },
      ...((employeeList||canEdit||canBan)?[{ key:'actions', title:'عملیات', render:(u:AdminUser) => employeeList ? <span className="muted">مدیریت از بخش «کارمندان»</span> : <div className="row-actions">{canEdit&&<button className="icon-button" onClick={() => openEdit(u)} title="ویرایش"><Pencil size={17}/></button>}{canBanFromUsers(u)&&<button className={`icon-button ${u.is_banned ? 'is-success' : 'is-danger'}`} onClick={() => setBanTarget(u)} title={u.is_banned ? 'رفع مسدودی' : 'مسدود کردن'}>{u.is_banned ? <Unlock size={17}/> : <Ban size={17}/>}</button>}</div> }]:[]),
    ]} />{remote.data && <Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage} />}</>}</Card>
    <Modal open={Boolean(selected)} title="ویرایش کاربر" onClose={() => setSelected(null)}>{draft && <div className="form-grid"><Field label="نام"><input value={draft.first_name} onChange={e => setDraft({...draft,first_name:e.target.value})}/></Field><Field label="نام خانوادگی"><input value={draft.last_name} onChange={e => setDraft({...draft,last_name:e.target.value})}/></Field><Field label="ایمیل"><input dir="ltr" value={draft.email} onChange={e => setDraft({...draft,email:e.target.value})}/></Field><Field label="کیفیت پخش"><ProductSelect ariaLabel="کیفیت پخش کاربر" value={draft.stream_quality} onValueChange={value=>setDraft({...draft,stream_quality:value})} options={[{value:'medium',label:'متوسط'},{value:'high',label:'بالا'}]}/></Field><div className="dialog-actions form-grid__full"><button className="button button--ghost" onClick={() => setSelected(null)}>انصراف</button><button className="button button--primary" disabled={busy} onClick={saveEdit}><ShieldCheck size={17}/>ذخیره تغییرات</button></div></div>}</Modal>
    <Confirm open={Boolean(banTarget)} title={banTarget?.is_banned ? 'رفع مسدودی کاربر' : 'مسدود کردن کاربر'} text={banTarget?.is_banned ? 'حساب دوباره فعال می‌شود و تمام اطلاعات قبلی دست‌نخورده باقی می‌ماند.' : 'حساب غیرفعال می‌شود، اما هیچ آهنگ، آلبوم، پلی‌لیست یا اطلاعاتی حذف نخواهد شد.'} confirmLabel={banTarget?.is_banned ? 'رفع مسدودی' : 'مسدود کردن'} danger={!banTarget?.is_banned} busy={busy} onConfirm={toggleBan} onClose={() => setBanTarget(null)} />
  </div>
}
