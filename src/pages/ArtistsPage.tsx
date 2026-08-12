import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CheckCircle2, Eye, Pencil, ShieldCheck, Trash2, Unlock, XCircle } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString, resolveMediaUrl } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa } from '../lib/format'
import type { Artist, ArtistAuth, Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

export default function ArtistsPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'artists'|'pending'>('artists')
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [verified, setVerified] = useState('')
  const [artistPage, setArtistPage] = useState(1)
  const [pendingPage, setPendingPage] = useState(1)
  const [artist, setArtist] = useState<Artist | null>(null)
  const [application, setApplication] = useState<ArtistAuth | null>(null)
  const [claimedArtist, setClaimedArtist] = useState<Artist | null>(null)
  const [applicationLoading, setApplicationLoading] = useState(false)
  const [banTarget, setBanTarget] = useState<Artist | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Artist | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifyingArtistId, setVerifyingArtistId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string,string>>({})
  const q = useDebouncedValue(search)
  const toast = useToast()
  const artists = useRemote<Paginated<Artist>>('/admin/artists/' + queryString({ q, verified, page:artistPage, page_size:20 }))
  const pending = useRemote<Paginated<ArtistAuth>>('/admin/pend_artists/' + queryString({ page:pendingPage, page_size:20 }))

  const artistVisible=(item:Artist)=>verified===''||String(item.verified)===verified
  const verifyArtistExact=(item:Artist,snapshot=pageSnapshot(artists.data,item.id),refreshPage=false,expect?:{verified?:boolean;banned?:boolean;missing?:boolean;saved?:boolean})=>{
    void verifyExactEntity<Artist>(`/admin/artists/${item.id}/`,{
      found:server=>artists.setData(current=>setPaginatedItem(current,server,{visible:artistVisible(server),indexHint:snapshot.index})),
      missing:()=>artists.setData(current=>removePaginatedItem(current,item.id)),
    },expect?.missing?{stopOnMissing:true}:expect?.verified!==undefined?{stopWhenFound:server=>server.verified===expect.verified}:expect?.banned!==undefined?{stopWhenFound:server=>server.user_is_banned===expect.banned}:expect?.saved?{stopWhenFound:server=>mutationFieldsMatch(server,item,['name','name_en','artistic_name','artistic_name_en','email','city','city_en','bio','bio_en'])}:{}).then(outcome=>{if(refreshPage&&outcome!=='superseded')void artists.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
  }
  function editArtist(item: Artist) { setArtist(item); setDraft({ name:item.name || '', name_en:item.name_en || '', artistic_name:item.artistic_name || '', artistic_name_en:item.artistic_name_en || '', email:item.email || '', city:item.city || '', city_en:item.city_en || '', bio:item.bio || '', bio_en:item.bio_en || '' }) }
  async function saveArtist() {
    if (!artist) return
    const target=artist; const snapshot=pageSnapshot(artists.data,target.id)
    setBusy(true)
    const form = new FormData(); Object.entries(draft).forEach(([key,value]) => form.set(key,value))
    try { const response=await api<Artist>(`/admin/artists/${target.id}/`, {method:'PATCH',body:form}); const updated:Artist={...response,...draft}; artists.setData(current=>setPaginatedItem(current,updated,{visible:artistVisible(updated),indexHint:snapshot.index})); toast.show('اطلاعات هنرمند ذخیره شد.','success'); setArtist(null); verifyArtistExact(updated,snapshot,true,{saved:true}) }
    catch(err){toast.show(errorMessageFa(err),'error')} finally{setBusy(false)}
  }
  async function verifyArtist(item: Artist) {
    if (item.verified || verifyingArtistId !== null) return
    const snapshot=pageSnapshot(artists.data,item.id)
    setVerifyingArtistId(item.id)
    const form = new FormData(); form.set('verified', 'true')
    try { const result=await api<Artist>(`/admin/artists/${item.id}/`, {method:'PATCH',body:form}); const updated={...item,...result,verified:true}; artists.setData(current=>setPaginatedItem(current,updated,{visible:artistVisible(updated),indexHint:snapshot.index})); toast.show('هنرمند تأیید شد.','success'); verifyArtistExact(updated,snapshot,true,{verified:true}) }
    catch(err){toast.show(errorMessageFa(err, 'تأیید هنرمند انجام نشد.'),'error')} finally{setVerifyingArtistId(null)}
  }
  async function openApplication(item: ArtistAuth) {
    setApplication(item)
    setClaimedArtist(null)
    setApplicationLoading(true)
    try {
      const detail = await api<ArtistAuth>(`/admin/pend_artists/${item.id}/`)
      setApplication(detail)
      if (detail.auth_type === 'existing_artist' && detail.artist_claimed) {
        try {
          setClaimedArtist(await api<Artist>(`/admin/artists/${detail.artist_claimed}/`))
        } catch (err) {
          toast.show(errorMessageFa(err, 'اطلاعات پروفایل هنرمند انتخاب‌شده دریافت نشد.'), 'error')
        }
      }
    } catch (err) {
      toast.show(errorMessageFa(err, 'جزئیات درخواست دریافت نشد.'), 'error')
    } finally {
      setApplicationLoading(false)
    }
  }
  function closeApplication() {
    setApplication(null)
    setClaimedArtist(null)
    setApplicationLoading(false)
  }

  async function review(status: 'accepted'|'rejected') {
    if (!application) return
    const target=application; const snapshot=pageSnapshot(pending.data,target.id)
    setBusy(true)
    try {
      const result=await api<ArtistAuth>(`/admin/pend_artists/${target.id}/`, {method:'PATCH',body:jsonBody({status,is_verified:status==='accepted'})}); const updated={...target,...result,status,is_verified:status==='accepted'}
      pending.setData(current=>removePaginatedItem(current,target.id))
      toast.show(status==='accepted'?'درخواست هنرمند تأیید شد.':'درخواست هنرمند رد شد.','success')
      closeApplication()
      const syncClaimedArtist=(claimed:ArtistAuth['artist_claimed'])=>{
        if(status!=='accepted'||!claimed)return
        const artistId=Number(claimed);if(!Number.isFinite(artistId)||artistId<=0)return
        const artistSnapshot=pageSnapshot(artists.data,artistId)
        void verifyExactEntity<Artist>(`/admin/artists/${artistId}/`,{
          found:server=>artists.setData(current=>setPaginatedItem(current,server,{visible:artistSnapshot.index>=0&&artistVisible(server),indexHint:artistSnapshot.index})),
          missing:()=>artists.setData(current=>removePaginatedItem(current,artistId)),
        }).then(outcome=>{if(outcome!=='superseded')void artists.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,artistSnapshot.order))})
      }
      syncClaimedArtist(updated.artist_claimed)
      void verifyExactEntity<ArtistAuth>(`/admin/pend_artists/${target.id}/`,{
        found:server=>{pending.setData(current=>setPaginatedItem(current,server,{visible:!['accepted','rejected'].includes(server.status),indexHint:snapshot.index}));syncClaimedArtist(server.artist_claimed)},
        missing:()=>pending.setData(current=>removePaginatedItem(current,target.id)),
      },{stopWhenFound:server=>server.status===status}).then(outcome=>{if(outcome!=='superseded')void pending.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
    } catch(err){toast.show(errorMessageFa(err),'error')} finally{setBusy(false)}
  }
  async function toggleBan() {
    if (!banTarget?.user) return
    const target=banTarget; const snapshot=pageSnapshot(artists.data,target.id); const nextBanned = !target.user_is_banned
    setBusy(true)
    try {
      await api('/admin/users/ban/', {method:'POST',body:jsonBody({user_id:target.user,banned:nextBanned})})
      const local={...target,user_is_banned:nextBanned}
      artists.setData(current=>setPaginatedItem(current,local))
      toast.show(nextBanned ? 'حساب مرتبط با هنرمند بدون حذف محتوا مسدود شد.' : 'مسدودی حساب هنرمند برداشته شد.','success')
      setBanTarget(null)
      verifyArtistExact(local,snapshot,true,{banned:nextBanned})
    } catch(err){toast.show(errorMessageFa(err),'error')} finally{setBusy(false)}
  }
  async function deleteArtist() {
    if (!deleteTarget) return
    const target=deleteTarget; const snapshot=pageSnapshot(artists.data,target.id)
    setBusy(true)
    try {
      await api(`/admin/artists/${target.id}/`, {method:'DELETE'})
      artists.setData(current=>removePaginatedItem(current,target.id))
      toast.show('پروفایل هنرمند حذف شد.','success')
      setDeleteTarget(null)
      verifyArtistExact(target,snapshot,true,{missing:true})
    } catch(err){toast.show(errorMessageFa(err, 'حذف هنرمند انجام نشد.'),'error')} finally{setBusy(false)}
  }

  const current = tab==='artists' ? artists : pending
  return <div className="page-stack">
    <PageHeader title="مدیریت هنرمندان" description="پروفایل هنرمندان و بررسی درخواست‌های احراز" />
    <div className="segmented">
      <button className={tab==='artists'?'is-active':''} onClick={()=>setTab('artists')}>هنرمندان</button>
      <button className={tab==='pending'?'is-active':''} onClick={()=>setTab('pending')}>درخواست‌های تأیید {pending.data?.count ? <span className="tab-count">{pending.data.count.toLocaleString('fa-IR')}</span> : null}</button>
    </div>
    {tab==='artists' && <Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setArtistPage(1)}} placeholder="نام هنرمند، شماره همراه یا ایمیل"/><div className="filters"><ProductSelect ariaLabel="فیلتر تأیید هنرمندان" value={verified} onValueChange={value=>{setVerified(value);setArtistPage(1)}} options={[{value:'',label:'همه هنرمندان'},{value:'true',label:'تأیید شده'},{value:'false',label:'تأیید نشده'}]}/></div></Card>}
    <Card>{current.error ? <ErrorState message={current.error} retry={()=>void current.reload()}/> : tab==='artists' ? <><DataTable<Artist> loading={artists.loading} rows={artists.data?.results || []} columns={[
      {key:'artist',title:'هنرمند',render:a=><div className="person-cell"><span className="avatar avatar--image">{a.profile_image?<img src={a.profile_image} alt="" loading="lazy"/>:(a.artistic_name||a.name)?.[0]}</span><div><strong>{a.artistic_name||a.name}</strong><span>{a.name}</span></div></div>},
      {key:'phone',title:'شماره همراه',render:a=><span dir="ltr">{a.user_phone||'—'}</span>},
      {key:'verify',title:'وضعیت',render:a=><div className="artist-status-cell">{a.verified?<span className="status status--success">تأیید شده</span>:<><span className="status status--neutral">تأیید نشده</span><button className="quick-verify" disabled={verifyingArtistId!==null} onClick={()=>void verifyArtist(a)} title="تأیید سریع هنرمند"><CheckCircle2 size={14}/>{verifyingArtistId===a.id?'در حال تأیید…':'تأیید سریع'}</button></>}</div>},
      {key:'created',title:'ایجاد',render:a=>dateTimeFa(a.created_at)},
      {key:'actions',title:'عملیات',render:a=><div className="row-actions"><button className="icon-button" onClick={()=>editArtist(a)} title="ویرایش"><Pencil size={17}/></button>{a.user&&<button className={`icon-button ${a.user_is_banned?'is-success':'is-danger'}`} onClick={()=>setBanTarget(a)} title={a.user_is_banned?'رفع مسدودی':'مسدودسازی امن'}>{a.user_is_banned?<Unlock size={17}/>:<Ban size={17}/>}</button>}<button className="icon-button is-danger" onClick={()=>setDeleteTarget(a)} title="حذف هنرمند"><Trash2 size={17}/></button></div>},
    ]}/>{artists.data&&<Pagination count={artists.data.count} page={artistPage} pageSize={20} onPage={setArtistPage}/>}</> : <><DataTable<ArtistAuth> loading={pending.loading} rows={pending.data?.results||[]} columns={[
      {key:'name',title:'درخواست‌دهنده',render:a=><div><strong>{a.stage_name||`${a.first_name||''} ${a.last_name||''}`.trim()||'بدون نام'}</strong><div className="subline" dir="ltr">{a.phone_number||'—'}</div></div>},
      {key:'type',title:'نوع درخواست',render:a=>a.auth_type==='existing_artist'?'اتصال به هنرمند موجود':'هنرمند جدید'},
      {key:'status',title:'وضعیت',render:a=><StatusBadge value={a.status}/>} ,
      {key:'created',title:'ثبت',render:a=>dateTimeFa(a.created_at)},
      {key:'action',title:'بررسی',render:a=><button className="button button--compact" onClick={()=>void openApplication(a)}><Eye size={16}/> مشاهده</button>},
    ]}/>{pending.data&&<Pagination count={pending.data.count} page={pendingPage} pageSize={20} onPage={setPendingPage}/>}</>}</Card>
    <Modal open={Boolean(artist)} title="ویرایش هنرمند" onClose={()=>setArtist(null)} wide>{artist&&<div className="form-grid"><Field label="نام"><input value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><Field label="معادل انگلیسی نام"><input dir="ltr" value={draft.name_en||''} onChange={e=>setDraft({...draft,name_en:e.target.value})}/></Field><Field label="نام هنری"><input value={draft.artistic_name||''} onChange={e=>setDraft({...draft,artistic_name:e.target.value})}/></Field><Field label="معادل انگلیسی نام هنری"><input dir="ltr" value={draft.artistic_name_en||''} onChange={e=>setDraft({...draft,artistic_name_en:e.target.value})}/></Field><Field label="ایمیل"><input dir="ltr" value={draft.email||''} onChange={e=>setDraft({...draft,email:e.target.value})}/></Field><Field label="شهر"><input value={draft.city||''} onChange={e=>setDraft({...draft,city:e.target.value})}/></Field><Field label="معادل انگلیسی شهر"><input dir="ltr" value={draft.city_en||''} onChange={e=>setDraft({...draft,city_en:e.target.value})}/></Field><Field label="زندگی‌نامه"><textarea value={draft.bio||''} onChange={e=>setDraft({...draft,bio:e.target.value})}/></Field><Field label="معادل انگلیسی زندگی‌نامه"><textarea dir="ltr" value={draft.bio_en||''} onChange={e=>setDraft({...draft,bio_en:e.target.value})}/></Field><div className="dialog-actions form-grid__full"><button className="button button--ghost" onClick={()=>setArtist(null)}>انصراف</button><button className="button button--primary" disabled={busy} onClick={saveArtist}><ShieldCheck size={17}/>ذخیره</button></div></div>}</Modal>
    <Modal open={Boolean(application)} title="بررسی درخواست احراز هنرمند" onClose={closeApplication} wide className="artist-auth-review-modal">{application&&<div className="artist-auth-review">
      <div className="review-summary-bar">
        <div><span>نوع درخواست</span><strong>{application.auth_type==='existing_artist'?'احراز مالکیت هنرمند موجود':'ثبت هنرمند جدید'}</strong></div>
        <div><span>وضعیت</span><StatusBadge value={application.status}/></div>
        <div><span>زمان ثبت</span><strong>{dateTimeFa(application.created_at)}</strong></div>
        <div><span>آخرین تغییر</span><strong>{dateTimeFa(application.updated_at)}</strong></div>
      </div>
      {applicationLoading&&<div className="inline-note">در حال دریافت آخرین اطلاعات و پیوندهای امن رسانه…</div>}
      {application.auth_type==='existing_artist'&&<section className="review-section">
        <div className="review-section__title"><strong>پروفایل هنرمند انتخاب‌شده</strong><span>این درخواست برای اتصال حساب کاربر به پروفایل موجود ثبت شده است.</span></div>
        {claimedArtist?<div className="claimed-artist-card">
          <span className="avatar avatar--image avatar--lg">{claimedArtist.profile_image?<img src={resolveMediaUrl(claimedArtist.profile_image)} alt="تصویر هنرمند"/>:(claimedArtist.artistic_name||claimedArtist.name)?.[0]}</span>
          <div><strong>{claimedArtist.artistic_name||claimedArtist.name}</strong><span>{claimedArtist.name}</span><small>شناسه هنرمند: {claimedArtist.id.toLocaleString('fa-IR')}</small></div>
          <span className={`status ${claimedArtist.verified?'status--success':'status--neutral'}`}>{claimedArtist.verified?'تأیید شده':'تأیید نشده'}</span>
        </div>:<div className="inline-note">شناسه هنرمند انتخاب‌شده: {application.artist_claimed ? Number(application.artist_claimed).toLocaleString('fa-IR') : '—'}</div>}
      </section>}
      <section className="review-section">
        <div className="review-section__title"><strong>اطلاعات هویتی و تماس</strong><span>تمام مقادیر ذخیره‌شده در درخواست احراز</span></div>
        <div className="review-info-grid">
          <div><span>نام فارسی</span><strong>{application.first_name||'—'}</strong></div>
          <div><span>نام انگلیسی</span><strong dir="ltr">{application.first_name_en||'—'}</strong></div>
          <div><span>نام خانوادگی فارسی</span><strong>{application.last_name||'—'}</strong></div>
          <div><span>نام خانوادگی انگلیسی</span><strong dir="ltr">{application.last_name_en||'—'}</strong></div>
          <div><span>نام هنری فارسی</span><strong>{application.stage_name||'—'}</strong></div>
          <div><span>نام هنری انگلیسی</span><strong dir="ltr">{application.stage_name_en||'—'}</strong></div>
          <div><span>تاریخ تولد</span><strong>{application.birth_date||'—'}</strong></div>
          <div><span>کد ملی</span><strong dir="ltr">{application.national_id||'—'}</strong></div>
          <div><span>شماره همراه</span><strong dir="ltr">{application.phone_number||'—'}</strong></div>
          <div><span>ایمیل</span><strong dir="ltr">{application.email||'—'}</strong></div>
          <div><span>شهر فارسی</span><strong>{application.city||'—'}</strong></div>
          <div><span>شهر انگلیسی</span><strong dir="ltr">{application.city_en||'—'}</strong></div>
          <div><span>شناسه کاربر</span><strong>{application.user ? Number(application.user).toLocaleString('fa-IR') : '—'}</strong></div>
          <div><span>شناسه درخواست</span><strong>{application.id.toLocaleString('fa-IR')}</strong></div>
        </div>
      </section>
      {(application.address||application.address_en||application.biography||application.biography_en)&&<section className="review-section review-section--text">
        <div className="review-section__title"><strong>نشانی و معرفی هنرمند</strong><span>متن‌های تکمیلی ثبت‌شده توسط درخواست‌دهنده</span></div>
        <div className="review-text-grid">
          {application.address&&<div><span>نشانی فارسی</span><p>{application.address}</p></div>}
          {application.address_en&&<div><span>نشانی انگلیسی</span><p dir="ltr">{application.address_en}</p></div>}
          {application.biography&&<div><span>زندگی‌نامه فارسی</span><p>{application.biography}</p></div>}
          {application.biography_en&&<div><span>زندگی‌نامه انگلیسی</span><p dir="ltr">{application.biography_en}</p></div>}
        </div>
      </section>}
      <section className="review-section">
        <div className="review-section__title"><strong>مدارک و تصاویر</strong><span>پیوندهای خصوصی فضای ذخیره‌سازی به‌صورت امن توسط سرور امضا می‌شوند.</span></div>
        <div className="review-document-grid">
          {application.profile_image?<a href={resolveMediaUrl(application.profile_image)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(application.profile_image)} alt="تصویر پروفایل"/><div><strong>تصویر پروفایل</strong><span>نمایش در اندازه کامل</span></div></a>:<div className="review-document-empty"><strong>تصویر پروفایل</strong><span>ارسال نشده است</span></div>}
          {application.national_id_image?<a href={resolveMediaUrl(application.national_id_image)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(application.national_id_image)} alt="تصویر مدرک هویتی"/><div><strong>مدرک هویتی</strong><span>نمایش در اندازه کامل</span></div></a>:<div className="review-document-empty"><strong>مدرک هویتی</strong><span>در دسترس نیست</span></div>}
        </div>
      </section>
      <div className="dialog-actions review-sticky-actions"><button className="button button--danger" disabled={busy} onClick={()=>review('rejected')}><XCircle size={17}/>رد درخواست</button><button className="button button--primary" disabled={busy} onClick={()=>review('accepted')}><CheckCircle2 size={17}/>تأیید هنرمند</button></div>
    </div>}</Modal>
    <Confirm open={Boolean(banTarget)} title={banTarget?.user_is_banned?'رفع مسدودی حساب':'مسدودسازی حساب'} text={banTarget?.user_is_banned?'دسترسی حساب مرتبط با این هنرمند دوباره فعال شود؟':'حساب مرتبط با این هنرمند مسدود می‌شود، اما پروفایل و محتوای منتشرشده برای حفظ یکپارچگی داده حذف نخواهد شد.'} confirmLabel={banTarget?.user_is_banned?'رفع مسدودی':'مسدود کردن'} danger={!banTarget?.user_is_banned} busy={busy} onConfirm={toggleBan} onClose={()=>setBanTarget(null)}/>
    <Confirm open={Boolean(deleteTarget)} title="حذف دائمی هنرمند" text="این عملیات فقط برای پروفایل هنرمندی که هیچ آهنگ، آلبوم، انتشار یا سابقه تسویه وابسته ندارد مجاز است. در غیر این صورت سرور برای حفاظت از اطلاعات، حذف را متوقف می‌کند." confirmLabel="حذف دائمی" danger busy={busy} onConfirm={deleteArtist} onClose={()=>setDeleteTarget(null)}/>
  </div>
}
