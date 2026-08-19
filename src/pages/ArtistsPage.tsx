import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, CheckCircle2, Eye, ImagePlus, Pencil, Plus, ShieldCheck, Trash2, Unlock, XCircle } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString, resolveMediaUrl } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa } from '../lib/format'
import type { Artist, ArtistAuth, Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useImageCropper } from '../contexts/ImageCropperContext'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

export default function ArtistsPage() {
  const {user}=useAuth()
  const canEdit=can(user,'artists.edit'), canKyc=can(user,'artists.kyc'), canVerify=can(user,'artists.verify'), canBan=can(user,'artists.ban'), canDelete=can(user,'artists.delete')
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'artists'|'pending'>('artists')
  const [search, setSearch] = useState(() => params.get('q') || '')
  const [verified, setVerified] = useState('')
  const [artistPage, setArtistPage] = useState(1)
  const [pendingPage, setPendingPage] = useState(1)
  const [artist, setArtist] = useState<Artist | null>(null)
  const [creating, setCreating] = useState(false)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState('')
  const [bannerPreview, setBannerPreview] = useState('')
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
  const { cropImage } = useImageCropper()
  const artists = useRemote<Paginated<Artist>>('/admin/artists/' + queryString({ q, verified, page:artistPage, page_size:20 }))
  const pending = useRemote<Paginated<ArtistAuth>>('/admin/pend_artists/' + queryString({ page:pendingPage, page_size:20 }))

  const artistVisible=(item:Artist)=>verified===''||String(item.verified)===verified
  const verifyArtistExact=(item:Artist,snapshot=pageSnapshot(artists.data,item.id),refreshPage=false,expect?:{verified?:boolean;banned?:boolean;missing?:boolean;saved?:boolean})=>{
    void verifyExactEntity<Artist>(`/admin/artists/${item.id}/`,{
      found:server=>artists.setData(current=>setPaginatedItem(current,server,{visible:artistVisible(server),indexHint:snapshot.index})),
      missing:()=>artists.setData(current=>removePaginatedItem(current,item.id)),
    },expect?.missing?{stopOnMissing:true}:expect?.verified!==undefined?{stopWhenFound:server=>server.verified===expect.verified}:expect?.banned!==undefined?{stopWhenFound:server=>server.user_is_banned===expect.banned}:expect?.saved?{stopWhenFound:server=>mutationFieldsMatch(server,item,['name','name_en','artistic_name','artistic_name_en','unique_id','email','city','city_en','bio','bio_en'])}:{}).then(outcome=>{if(refreshPage&&outcome!=='superseded')void artists.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
  }
  const artistDraft = (item?:Artist|null) => ({
    name:item?.name||'', name_en:item?.name_en||'', artistic_name:item?.artistic_name||'', artistic_name_en:item?.artistic_name_en||'',
    unique_id:item?.unique_id||'', email:item?.email||'', city:item?.city||'', city_en:item?.city_en||'', date_of_birth:item?.date_of_birth||'',
    address:item?.address||'', address_en:item?.address_en||'', id_number:item?.id_number||'', bio:item?.bio||'', bio_en:item?.bio_en||'',
    verified:item?.verified?'true':'false', instagram:item?.social_accounts?.find(x=>x.platform_slug==='instagram')?.url||'', twitter:item?.social_accounts?.find(x=>x.platform_slug==='twitter')?.url||'', youtube:item?.social_accounts?.find(x=>x.platform_slug==='youtube')?.url||'', telegram:item?.social_accounts?.find(x=>x.platform_slug==='telegram')?.url||'',
  })
  function clearArtistEditor(){setArtist(null);setCreating(false);setProfileFile(null);setBannerFile(null);setProfilePreview('');setBannerPreview('')}
  function editArtist(item: Artist) { setCreating(false); setArtist(item); setDraft(artistDraft(item)); setProfilePreview(resolveMediaUrl(item.profile_image)); setBannerPreview(resolveMediaUrl(item.banner_image)); setProfileFile(null); setBannerFile(null) }
  function createArtist(){setArtist(null);setCreating(true);setDraft(artistDraft());setProfileFile(null);setBannerFile(null);setProfilePreview('');setBannerPreview('')}
  async function chooseArtistImage(kind:'profile'|'banner', file?:File){
    if(!file)return
    const result=await cropImage(file,{mode:kind==='profile'?'square':'free',initialAspectRatio:kind==='banner'?16/5:1,title:kind==='profile'?'برش تصویر پروفایل':'برش بنر هنرمند',description:kind==='profile'?'تصویر پروفایل به‌صورت مربعی ذخیره می‌شود.':'برای بنر نسبت تصویر آزاد است و قاب اولیه ۱۶ به ۵ در نظر گرفته می‌شود.',maxSourceBytes:40*1024*1024,maxOutputBytes:(kind==='profile'?4.8:9.5)*1024*1024,maxOutputDimension:kind==='profile'?1800:3600})
    if(!result)return
    const preview=URL.createObjectURL(result.file)
    if(kind==='profile'){setProfileFile(result.file);setProfilePreview(preview)}else{setBannerFile(result.file);setBannerPreview(preview)}
  }
  async function saveArtist() {
    if (!artist && !creating) return
    if(!String(draft.name||'').trim()||!String(draft.name_en||'').trim()){toast.show('نام فارسی و معادل انگلیسی نام الزامی است.','error');return}
    const target=artist
    setBusy(true)
    const form = new FormData(); Object.entries(draft).forEach(([key,value]) => { if(['instagram','twitter','youtube','telegram'].includes(key))return; if(!canKyc&&['date_of_birth','address','address_en','id_number'].includes(key))return; if(!canVerify&&key==='verified')return; form.set(key,value) })
    form.set('social_accounts',JSON.stringify({instagram:draft.instagram||'',twitter:draft.twitter||'',youtube:draft.youtube||'',telegram:draft.telegram||''}))
    if(profileFile)form.set('profile_image_upload',profileFile)
    if(bannerFile)form.set('banner_image_upload',bannerFile)
    try {
      const response=await api<Artist>(target?`/admin/artists/${target.id}/`:'/admin/artists/', {method:target?'PATCH':'POST',body:form})
      if(target){const snapshot=pageSnapshot(artists.data,target.id);const updated:Artist={...response};artists.setData(current=>setPaginatedItem(current,updated,{visible:artistVisible(updated),indexHint:snapshot.index}));verifyArtistExact(updated,snapshot,true,{saved:true})}
      else{void artists.reload()}
      toast.show(target?'اطلاعات هنرمند ذخیره شد.':'هنرمند مستقل با موفقیت ایجاد شد.','success'); clearArtistEditor()
    } catch(err){toast.show(errorMessageFa(err),'error')} finally{setBusy(false)}
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
    <PageHeader title="مدیریت هنرمندان" description="پروفایل هنرمندان و بررسی درخواست‌های احراز" actions={canEdit?<button className="button button--primary" onClick={createArtist}><Plus size={17}/>ایجاد هنرمند</button>:undefined} />
    <div className="segmented">
      <button className={tab==='artists'?'is-active':''} onClick={()=>setTab('artists')}>هنرمندان</button>
      <button className={tab==='pending'?'is-active':''} onClick={()=>setTab('pending')}>درخواست‌های تأیید {pending.data?.count ? <span className="tab-count">{pending.data.count.toLocaleString('fa-IR')}</span> : null}</button>
    </div>
    {tab==='artists' && <Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setArtistPage(1)}} placeholder="نام هنرمند، شماره همراه یا ایمیل"/><div className="filters"><ProductSelect ariaLabel="فیلتر تأیید هنرمندان" value={verified} onValueChange={value=>{setVerified(value);setArtistPage(1)}} options={[{value:'',label:'همه هنرمندان'},{value:'true',label:'تأیید شده'},{value:'false',label:'تأیید نشده'}]}/></div></Card>}
    <Card>{current.error ? <ErrorState message={current.error} retry={()=>void current.reload()}/> : tab==='artists' ? <><DataTable<Artist> loading={artists.loading} rows={artists.data?.results || []} columns={[
      {key:'artist',title:'هنرمند',render:a=><div className="person-cell"><span className="avatar avatar--image">{a.profile_image?<img src={a.profile_image} alt="" loading="lazy"/>:(a.artistic_name||a.name)?.[0]}</span><div><strong>{a.artistic_name||a.name}</strong><span>{a.name}</span></div></div>},
      {key:'phone',title:'شماره همراه',render:a=><span dir="ltr">{a.user_phone||'—'}</span>},
      {key:'verify',title:'وضعیت',render:a=><div className="artist-status-cell">{a.verified?<span className="status status--success">تأیید شده</span>:<><span className="status status--neutral">تأیید نشده</span>{canVerify&&<button className="quick-verify" disabled={verifyingArtistId!==null} onClick={()=>void verifyArtist(a)} title="تأیید سریع هنرمند"><CheckCircle2 size={14}/>{verifyingArtistId===a.id?'در حال تأیید…':'تأیید سریع'}</button>}</>}</div>},
      {key:'created',title:'ایجاد',render:a=>dateTimeFa(a.created_at)},
      ...((canEdit||canBan||canDelete)?[{key:'actions',title:'عملیات',render:(a:Artist)=><div className="row-actions">{canEdit&&<button className="icon-button" onClick={()=>editArtist(a)} title="ویرایش"><Pencil size={17}/></button>}{canBan&&a.user&&<button className={`icon-button ${a.user_is_banned?'is-success':'is-danger'}`} onClick={()=>setBanTarget(a)} title={a.user_is_banned?'رفع مسدودی':'مسدودسازی امن'}>{a.user_is_banned?<Unlock size={17}/>:<Ban size={17}/>}</button>}{canDelete&&<button className="icon-button is-danger" onClick={()=>setDeleteTarget(a)} title="حذف هنرمند"><Trash2 size={17}/></button>}</div>}]:[]),
    ]}/>{artists.data&&<Pagination count={artists.data.count} page={artistPage} pageSize={20} onPage={setArtistPage}/>}</> : <><DataTable<ArtistAuth> loading={pending.loading} rows={pending.data?.results||[]} columns={[
      {key:'name',title:'درخواست‌دهنده',render:a=><div><strong>{a.stage_name||`${a.first_name||''} ${a.last_name||''}`.trim()||'بدون نام'}</strong><div className="subline" dir="ltr">{a.phone_number||'—'}</div></div>},
      {key:'type',title:'نوع درخواست',render:a=>a.auth_type==='existing_artist'?'اتصال به هنرمند موجود':'هنرمند جدید'},
      {key:'status',title:'وضعیت',render:a=><StatusBadge value={a.status}/>} ,
      {key:'created',title:'ثبت',render:a=>dateTimeFa(a.created_at)},
      {key:'action',title:canVerify?'بررسی':'مشاهده',render:a=><button className="button button--compact" onClick={()=>void openApplication(a)}><Eye size={16}/> مشاهده</button>},
    ]}/>{pending.data&&<Pagination count={pending.data.count} page={pendingPage} pageSize={20} onPage={setPendingPage}/>}</>}</Card>
    <Modal open={Boolean(artist)||creating} title={creating?'ایجاد هنرمند مستقل':'ویرایش هنرمند'} onClose={clearArtistEditor} wide>{(artist||creating)&&<div className="artist-editor">
      {creating&&<div className="inline-note inline-note--success">این پروفایل مستقیماً توسط مدیر ساخته می‌شود و به حساب کاربری یا شماره همراه نیاز ندارد.</div>}
      <div className="artist-media-editor">
        <label className="artist-media-box artist-media-box--profile"><span>تصویر پروفایل</span>{profilePreview?<img src={profilePreview} alt="پروفایل"/>:<div className="artist-media-placeholder"><ImagePlus size={24}/>بدون تصویر</div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void chooseArtistImage('profile',e.target.files?.[0])}/><strong>انتخاب و برش مربعی</strong></label>
        <label className="artist-media-box artist-media-box--banner"><span>بنر هنرمند</span>{bannerPreview?<img src={bannerPreview} alt="بنر"/>:<div className="artist-media-placeholder"><ImagePlus size={24}/>بدون بنر</div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void chooseArtistImage('banner',e.target.files?.[0])}/><strong>انتخاب و برش بنر</strong></label>
      </div>
      <div className="form-section-title"><strong>اطلاعات اصلی</strong><span>فیلدهای دارای * برای ساخت پروفایل الزامی‌اند.</span></div>
      <div className="form-grid">
        <Field label="نام *"><input value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><Field label="معادل انگلیسی نام *"><input dir="ltr" value={draft.name_en||''} onChange={e=>setDraft({...draft,name_en:e.target.value})}/></Field>
        <Field label="نام هنری"><input value={draft.artistic_name||''} onChange={e=>setDraft({...draft,artistic_name:e.target.value})}/></Field><Field label="معادل انگلیسی نام هنری"><input dir="ltr" value={draft.artistic_name_en||''} onChange={e=>setDraft({...draft,artistic_name_en:e.target.value})}/></Field>
        <Field label="شناسه یکتای هنرمند (اختیاری)"><input dir="ltr" value={draft.unique_id||''} onChange={e=>setDraft({...draft,unique_id:e.target.value})}/></Field><Field label="ایمیل"><input dir="ltr" type="email" value={draft.email||''} onChange={e=>setDraft({...draft,email:e.target.value})}/></Field>
        {canKyc&&<Field label="تاریخ تولد"><input dir="ltr" type="date" value={draft.date_of_birth||''} onChange={e=>setDraft({...draft,date_of_birth:e.target.value})}/></Field>}
        <Field label="شهر"><input value={draft.city||''} onChange={e=>setDraft({...draft,city:e.target.value})}/></Field><Field label="معادل انگلیسی شهر"><input dir="ltr" value={draft.city_en||''} onChange={e=>setDraft({...draft,city_en:e.target.value})}/></Field>
        {canKyc&&<Field label="شماره شناسایی / کد ملی"><input dir="ltr" value={draft.id_number||''} onChange={e=>setDraft({...draft,id_number:e.target.value})}/></Field>}{canVerify&&<Field label="وضعیت تأیید"><select value={draft.verified||'false'} onChange={e=>setDraft({...draft,verified:e.target.value})}><option value="false">تأیید نشده</option><option value="true">تأیید شده</option></select></Field>}
      </div>
      <div className="form-section-title"><strong>اطلاعات تکمیلی</strong><span>اختیاری؛ برای پروفایل کامل‌تر قابل ثبت است.</span></div>
      <div className="form-grid">
        {canKyc&&<><Field label="نشانی"><textarea value={draft.address||''} onChange={e=>setDraft({...draft,address:e.target.value})}/></Field><Field label="معادل انگلیسی نشانی"><textarea dir="ltr" value={draft.address_en||''} onChange={e=>setDraft({...draft,address_en:e.target.value})}/></Field></>}
        <Field label="زندگی‌نامه"><textarea value={draft.bio||''} onChange={e=>setDraft({...draft,bio:e.target.value})}/></Field><Field label="معادل انگلیسی زندگی‌نامه"><textarea dir="ltr" value={draft.bio_en||''} onChange={e=>setDraft({...draft,bio_en:e.target.value})}/></Field>
      </div>
      <div className="form-section-title"><strong>شبکه‌های اجتماعی</strong><span>اختیاری؛ نشانی کامل با https:// وارد شود.</span></div>
      <div className="form-grid"><Field label="Instagram"><input dir="ltr" placeholder="https://instagram.com/..." value={draft.instagram||''} onChange={e=>setDraft({...draft,instagram:e.target.value})}/></Field><Field label="X / Twitter"><input dir="ltr" placeholder="https://x.com/..." value={draft.twitter||''} onChange={e=>setDraft({...draft,twitter:e.target.value})}/></Field><Field label="YouTube"><input dir="ltr" placeholder="https://youtube.com/@..." value={draft.youtube||''} onChange={e=>setDraft({...draft,youtube:e.target.value})}/></Field><Field label="Telegram"><input dir="ltr" placeholder="https://t.me/..." value={draft.telegram||''} onChange={e=>setDraft({...draft,telegram:e.target.value})}/></Field></div>
      <div className="dialog-actions"><button className="button button--ghost" onClick={clearArtistEditor}>انصراف</button><button className="button button--primary" disabled={busy} onClick={saveArtist}><ShieldCheck size={17}/>{creating?'ایجاد هنرمند':'ذخیره'}</button></div>
    </div>}</Modal>
    <Modal open={Boolean(application)} title={canVerify?"بررسی درخواست احراز هنرمند":"جزئیات درخواست احراز هنرمند"} onClose={closeApplication} wide className="artist-auth-review-modal">{application&&<div className="artist-auth-review">
      <div className="review-summary-bar">
        <div><span>نوع درخواست</span><strong>{application.auth_type==='existing_artist'?'احراز مالکیت هنرمند موجود':'ثبت هنرمند جدید'}</strong></div>
        <div><span>وضعیت</span><StatusBadge value={application.status}/></div>
        <div><span>زمان ثبت</span><strong>{dateTimeFa(application.created_at)}</strong></div>
        <div><span>آخرین تغییر</span><strong>{dateTimeFa(application.updated_at)}</strong></div>
      </div>
      {applicationLoading&&<div className="inline-note">در حال دریافت آخرین اطلاعات و مدارک…</div>}
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
          {canKyc&&<div><span>تاریخ تولد</span><strong>{application.birth_date||'—'}</strong></div>}
          {canKyc&&<div><span>کد ملی</span><strong dir="ltr">{application.national_id||'—'}</strong></div>}
          <div><span>شماره همراه</span><strong dir="ltr">{application.phone_number||'—'}</strong></div>
          <div><span>ایمیل</span><strong dir="ltr">{application.email||'—'}</strong></div>
          <div><span>شهر فارسی</span><strong>{application.city||'—'}</strong></div>
          <div><span>شهر انگلیسی</span><strong dir="ltr">{application.city_en||'—'}</strong></div>
          <div><span>شناسه کاربر</span><strong>{application.user ? Number(application.user).toLocaleString('fa-IR') : '—'}</strong></div>
          <div><span>شناسه درخواست</span><strong>{application.id.toLocaleString('fa-IR')}</strong></div>
        </div>
      </section>
      {(application.address||application.address_en||application.biography||application.biography_en)&&<section className="review-section review-section--text">
        <div className="review-section__title"><strong>{canKyc?'نشانی و معرفی هنرمند':'معرفی هنرمند'}</strong><span>متن‌های تکمیلی ثبت‌شده توسط درخواست‌دهنده</span></div>
        <div className="review-text-grid">
          {canKyc&&application.address&&<div><span>نشانی فارسی</span><p>{application.address}</p></div>}
          {canKyc&&application.address_en&&<div><span>نشانی انگلیسی</span><p dir="ltr">{application.address_en}</p></div>}
          {application.biography&&<div><span>زندگی‌نامه فارسی</span><p>{application.biography}</p></div>}
          {application.biography_en&&<div><span>زندگی‌نامه انگلیسی</span><p dir="ltr">{application.biography_en}</p></div>}
        </div>
      </section>}
      {canKyc&&<section className="review-section">
        <div className="review-section__title"><strong>مدارک و تصاویر</strong><span>مدارک و تصاویر ارسال‌شده برای بررسی هویت</span></div>
        <div className="review-document-grid">
          {application.profile_image?<a href={resolveMediaUrl(application.profile_image)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(application.profile_image)} alt="تصویر پروفایل"/><div><strong>تصویر پروفایل</strong><span>نمایش در اندازه کامل</span></div></a>:<div className="review-document-empty"><strong>تصویر پروفایل</strong><span>ارسال نشده است</span></div>}
          {application.national_id_image?<a href={resolveMediaUrl(application.national_id_image)} target="_blank" rel="noreferrer"><img src={resolveMediaUrl(application.national_id_image)} alt="تصویر مدرک هویتی"/><div><strong>مدرک هویتی</strong><span>نمایش در اندازه کامل</span></div></a>:<div className="review-document-empty"><strong>مدرک هویتی</strong><span>در دسترس نیست</span></div>}
        </div>
      </section>}
      {canVerify&&<div className="dialog-actions review-sticky-actions"><button className="button button--danger" disabled={busy} onClick={()=>review('rejected')}><XCircle size={17}/>رد درخواست</button><button className="button button--primary" disabled={busy} onClick={()=>review('accepted')}><CheckCircle2 size={17}/>تأیید هنرمند</button></div>}
    </div>}</Modal>
    <Confirm open={Boolean(banTarget)} title={banTarget?.user_is_banned?'رفع مسدودی حساب':'مسدودسازی حساب'} text={banTarget?.user_is_banned?'دسترسی حساب مرتبط با این هنرمند دوباره فعال شود؟':'حساب مرتبط با این هنرمند مسدود می‌شود، اما پروفایل و محتوای منتشرشده برای حفظ یکپارچگی داده حذف نخواهد شد.'} confirmLabel={banTarget?.user_is_banned?'رفع مسدودی':'مسدود کردن'} danger={!banTarget?.user_is_banned} busy={busy} onConfirm={toggleBan} onClose={()=>setBanTarget(null)}/>
    <Confirm open={Boolean(deleteTarget)} title="حذف دائمی هنرمند" text="حذف دائمی فقط زمانی انجام می‌شود که هیچ آهنگ، آلبوم، انتشار یا سابقه تسویه‌ای به این هنرمند وابسته نباشد." confirmLabel="حذف دائمی" danger busy={busy} onConfirm={deleteArtist} onClose={()=>setDeleteTarget(null)}/>
  </div>
}
