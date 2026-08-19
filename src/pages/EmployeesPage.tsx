import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString } from '../lib/api'
import { dateTimeFa } from '../lib/format'
import { useDebouncedValue } from '../lib/hooks'
import { emptyPermissions, permissionSections } from '../lib/permissions'
import type { AdminEmployee, Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'

type Draft = {
  phone_number:string
  first_name:string
  last_name:string
  email:string
  role:'manager'|'supervisor'
  is_active:boolean
  password:string
  permissions:Record<string,boolean>
}

const blankDraft = ():Draft => ({
  phone_number:'', first_name:'', last_name:'', email:'', role:'supervisor', is_active:true,
  password:'', permissions:emptyPermissions(),
})
const roleLabel=(role:string)=>role==='manager'?'مدیر':'سرپرست'
const accessCount=(permissions:Record<string,boolean>)=>permissionSections.filter(section=>permissions[`${section.key}.view`]).length
const makePassword=()=>{
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const values=new Uint32Array(14); crypto.getRandomValues(values)
  return Array.from(values,value=>chars[value%chars.length]).join('')
}

export default function EmployeesPage(){
  const toast=useToast()
  const [search,setSearch]=useState('')
  const [role,setRole]=useState('')
  const [state,setState]=useState('')
  const [page,setPage]=useState(1)
  const [editing,setEditing]=useState<AdminEmployee|null>(null)
  const [draft,setDraft]=useState<Draft|null>(null)
  const [busy,setBusy]=useState(false)
  const [deleteTarget,setDeleteTarget]=useState<AdminEmployee|null>(null)
  const [passwordTarget,setPasswordTarget]=useState<AdminEmployee|null>(null)
  const [newPassword,setNewPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [oneTimePassword,setOneTimePassword]=useState<{employee:string;password:string}|null>(null)
  const [oneTimeRevealed,setOneTimeRevealed]=useState(false)
  const q=useDebouncedValue(search)
  const path='/admin/employees/'+queryString({q,role,state,page,page_size:20})
  const remote=useRemote<Paginated<AdminEmployee>>(path)
  const rows=remote.data?.results||[]
  const enabledScreens=useMemo(()=>draft?permissionSections.filter(section=>draft.permissions[`${section.key}.view`]).length:0,[draft])

  const openCreate=()=>{setEditing(null);setDraft(blankDraft())}
  const openEdit=(employee:AdminEmployee)=>{setEditing(employee);setDraft({phone_number:employee.phone_number,first_name:employee.first_name||'',last_name:employee.last_name||'',email:employee.email||'',role:employee.role,is_active:employee.is_active,password:'',permissions:{...emptyPermissions(),...(employee.permissions||{})}})}

  const setScreen=(screen:string,on:boolean)=>setDraft(current=>{
    if(!current)return current
    const permissions={...current.permissions,[`${screen}.view`]:on}
    const section=permissionSections.find(item=>item.key===screen)
    if(!on)section?.details.forEach(detail=>{permissions[detail.key]=false})
    else section?.enableWithView?.forEach(key=>{permissions[key]=true})
    return {...current,permissions}
  })
  const setPermission=(key:string,on:boolean)=>setDraft(current=>{
    if(!current)return current
    const permissions={...current.permissions,[key]:on}
    if(on&&key==='artists.verify')permissions['artists.kyc']=true
    if(!on&&key==='artists.kyc')permissions['artists.verify']=false
    if(on&&key==='release_add.publish')permissions['release_add.edit']=true
    if(on&&(key==='finance.payout_review'||key==='finance.payout_pay'))permissions['finance.payouts']=true
    if(!on&&key==='finance.payouts'){permissions['finance.payout_review']=false;permissions['finance.payout_pay']=false}

    const scopeRules:[string,string[]][]=[
      ['finance',['finance.payments','finance.earnings','finance.payouts']],
      ['content',['content.promotions','content.banners','content.audio_ads']],
      ['support',['support.tickets','support.reports']],
    ]
    for(const [screen,keys] of scopeRules){
      if(key.startsWith(`${screen}.`)&&!keys.some(scopeKey=>Boolean(permissions[scopeKey])))permissions[`${screen}.view`]=false
    }
    return {...current,permissions}
  })

  const revealPassword=()=>{
    if(!draft?.password)return
    if(window.confirm('رمز عبور اطلاعات حساس است. فقط وقتی مطمئن هستید کسی صفحه را نمی‌بیند نمایش داده شود. نمایش داده شود؟'))setShowPassword(true)
  }
  const fillGenerated=()=>{if(!draft)return;setDraft({...draft,password:makePassword()});setShowPassword(false)}

  async function save(){
    if(!draft)return
    if(!draft.phone_number.trim()){toast.show('شماره همراه کارمند را وارد کنید.','error');return}
    if(!editing&&draft.password.length<8){toast.show('برای کارمند یک رمز حداقل ۸ کاراکتری تعیین کنید.','error');return}
    setBusy(true)
    try{
      const body:any={phone_number:draft.phone_number,first_name:draft.first_name,last_name:draft.last_name,email:draft.email||null,role:draft.role,is_active:draft.is_active,permissions:draft.permissions}
      if(!editing)body.password=draft.password
      const employee=await api<AdminEmployee>(editing?`/admin/employees/${editing.id}/`:'/admin/employees/',{method:editing?'PATCH':'POST',body:jsonBody(body)})
      if(!editing&&draft.password){setOneTimeRevealed(false);setOneTimePassword({employee:`${employee.first_name||''} ${employee.last_name||''}`.trim()||employee.phone_number,password:draft.password})}
      toast.show(editing?'تغییرات کارمند ذخیره شد.':'کارمند با موفقیت ساخته شد.','success')
      setDraft(null);setEditing(null);setShowPassword(false);void remote.reload()
    }catch(error){toast.show(errorMessageFa(error),'error')}finally{setBusy(false)}
  }

  const openPassword=(employee:AdminEmployee)=>{setPasswordTarget(employee);setNewPassword(makePassword());setShowPassword(false)}
  async function resetPassword(){
    if(!passwordTarget)return
    if(newPassword.length<8){toast.show('رمز عبور باید حداقل ۸ کاراکتر باشد.','error');return}
    setBusy(true)
    try{
      await api(`/admin/employees/${passwordTarget.id}/password/`,{method:'POST',body:jsonBody({password:newPassword})})
      setOneTimeRevealed(false);setOneTimePassword({employee:`${passwordTarget.first_name||''} ${passwordTarget.last_name||''}`.trim()||passwordTarget.phone_number,password:newPassword})
      setPasswordTarget(null);setShowPassword(false);toast.show('رمز تغییر کرد و نشست‌های قبلی کارمند بسته شد.','success')
    }catch(error){toast.show(errorMessageFa(error),'error')}finally{setBusy(false)}
  }
  async function removeEmployee(){
    if(!deleteTarget)return
    setBusy(true)
    try{await api(`/admin/employees/${deleteTarget.id}/`,{method:'DELETE'});toast.show('کارمند حذف شد.','success');setDeleteTarget(null);void remote.reload()}
    catch(error){toast.show(errorMessageFa(error),'error')}finally{setBusy(false)}
  }
  const copyPassword=async(password:string)=>{try{await navigator.clipboard.writeText(password);toast.show('رمز عبور کپی شد.','success')}catch{toast.show('کپی خودکار ممکن نبود.','error')}}

  return <div className="page-stack">
    <PageHeader title="کارمندان" description="ساخت حساب کارمند و تعیین دقیق بخش‌هایی که اجازه مشاهده یا مدیریت آن‌ها را دارد." actions={<button className="button button--primary" onClick={openCreate}><Plus size={18}/>کارمند جدید</button>}/>
    <Card className="employee-security-note"><ShieldCheck size={22}/><div><strong>دسترسی امن و ساده</strong><span>کارمندان فقط به بخش‌هایی که اینجا روشن می‌کنید دسترسی دارند و هیچ‌وقت به پنل Django دسترسی ندارند.</span></div></Card>
    <Card className="toolbar-card"><SearchBox value={search} onChange={value=>{setSearch(value);setPage(1)}} placeholder="نام، شماره همراه یا ایمیل"/><div className="filters"><ProductSelect ariaLabel="نقش کارمند" value={role} onValueChange={value=>{setRole(value);setPage(1)}} options={[{value:'',label:'همه عنوان‌ها'},{value:'manager',label:'مدیر'},{value:'supervisor',label:'سرپرست'}]}/><ProductSelect ariaLabel="وضعیت کارمند" value={state} onValueChange={value=>{setState(value);setPage(1)}} options={[{value:'',label:'همه وضعیت‌ها'},{value:'active',label:'فعال'},{value:'inactive',label:'غیرفعال'}]}/></div></Card>
    <Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<AdminEmployee> loading={remote.loading} rows={rows} emptyTitle="هنوز کارمندی ساخته نشده" columns={[
      {key:'employee',title:'کارمند',render:item=><div className="person-cell"><span className="avatar"><UserRoundCog size={18}/></span><div><strong>{`${item.first_name||''} ${item.last_name||''}`.trim()||'بدون نام'}</strong><span dir="ltr">{item.phone_number}</span></div></div>},
      {key:'role',title:'عنوان',render:item=><span>{roleLabel(item.role)}</span>},
      {key:'access',title:'دسترسی',render:item=><strong>{accessCount(item.permissions).toLocaleString('fa-IR')} بخش</strong>},
      {key:'state',title:'وضعیت',render:item=><StatusBadge value={item.is_active?'active':'disabled'}/>},
      {key:'login',title:'آخرین ورود',render:item=>dateTimeFa(item.last_login_at)},
      {key:'actions',title:'عملیات',render:item=><div className="row-actions"><button className="icon-button" onClick={()=>openEdit(item)} title="ویرایش دسترسی"><Pencil size={17}/></button><button className="icon-button" onClick={()=>openPassword(item)} title="تغییر رمز"><KeyRound size={17}/></button><button className="icon-button is-danger" onClick={()=>setDeleteTarget(item)} title="حذف"><Trash2 size={17}/></button></div>},
    ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card>

    <Modal open={Boolean(draft)} title={editing?'ویرایش کارمند':'ساخت کارمند جدید'} onClose={()=>{setDraft(null);setEditing(null);setShowPassword(false)}} wide>
      {draft&&<div className="employee-editor">
        <div className="employee-editor__intro"><div><strong>{editing?'اطلاعات و دسترسی کارمند':'۱. اطلاعات ورود کارمند'}</strong><span>{editing?'تغییر دسترسی فوراً نشست قبلی را باطل می‌کند.':'شماره همراه و رمز برای ورود به همین پنل استفاده می‌شود.'}</span></div>{editing&&<span className="employee-access-count">{enabledScreens.toLocaleString('fa-IR')} بخش فعال</span>}</div>
        <div className="form-grid">
          <Field label="شماره همراه"><input dir="ltr" inputMode="tel" value={draft.phone_number} onChange={e=>setDraft({...draft,phone_number:e.target.value})} placeholder="09xxxxxxxxx"/></Field>
          <Field label="عنوان"><ProductSelect ariaLabel="عنوان کارمند" value={draft.role} onValueChange={value=>setDraft({...draft,role:value as Draft['role']})} options={[{value:'supervisor',label:'سرپرست'},{value:'manager',label:'مدیر'}]}/></Field>
          <Field label="نام"><input value={draft.first_name} onChange={e=>setDraft({...draft,first_name:e.target.value})}/></Field>
          <Field label="نام خانوادگی"><input value={draft.last_name} onChange={e=>setDraft({...draft,last_name:e.target.value})}/></Field>
          <Field label="ایمیل"><input dir="ltr" type="email" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></Field>
          <Field label="وضعیت حساب"><label className="simple-switch-row"><input type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})}/><span>{draft.is_active?'فعال':'غیرفعال'}</span></label></Field>
          {!editing&&<Field label="رمز عبور" hint="حداقل ۸ کاراکتر؛ پس از ساخت فقط همین یک‌بار قابل نمایش است."><div className="password-input"><input dir="ltr" type={showPassword?'text':'password'} value={draft.password} onChange={e=>{setDraft({...draft,password:e.target.value});setShowPassword(false)}}/><button type="button" className="icon-button" onClick={showPassword?()=>setShowPassword(false):revealPassword} title="نمایش رمز">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button><button type="button" className="icon-button" onClick={fillGenerated} title="ساخت رمز امن"><RefreshCw size={17}/></button></div></Field>}
        </div>
        <div className="employee-permission-heading"><div><strong>{editing?'دسترسی‌ها':'۲. دسترسی‌ها'}</strong><span>فقط صفحه‌هایی را روشن کنید که این کارمند واقعاً نیاز دارد.</span></div></div>
        <div className="permission-grid">{permissionSections.map(section=>{
          const viewKey=`${section.key}.view`;const enabled=Boolean(draft.permissions[viewKey])
          return <section key={section.key} className={`permission-card ${enabled?'is-enabled':''}`}>
            <label className="permission-card__master"><div><strong>{section.title}</strong><span>{section.description}</span></div><input type="checkbox" checked={enabled} onChange={e=>setScreen(section.key,e.target.checked)}/></label>
            {enabled&&section.details.some(detail=>!detail.hidden)&&<div className="permission-card__details">{section.details.filter(detail=>!detail.hidden).map(detail=><label key={detail.key} className="permission-detail"><input type="checkbox" checked={Boolean(draft.permissions[detail.key])} onChange={e=>setPermission(detail.key,e.target.checked)}/><span><strong>{detail.label}</strong>{detail.hint&&<small>{detail.hint}</small>}</span></label>)}</div>}
          </section>
        })}</div>
        <div className="dialog-actions employee-editor__actions"><button className="button button--ghost" onClick={()=>{setDraft(null);setEditing(null)}} disabled={busy}>انصراف</button><button className="button button--primary" onClick={save} disabled={busy}><ShieldCheck size={17}/>{editing?'ذخیره تغییرات':'ساخت کارمند'}</button></div>
      </div>}
    </Modal>

    <Modal open={Boolean(passwordTarget)} title="تغییر رمز عبور" onClose={()=>{setPasswordTarget(null);setShowPassword(false)}}>
      {passwordTarget&&<div className="page-stack page-stack--tight"><p className="dialog-text">رمز جدید برای <strong>{`${passwordTarget.first_name||''} ${passwordTarget.last_name||''}`.trim()||passwordTarget.phone_number}</strong> تعیین می‌شود. بعد از ذخیره، تمام نشست‌های قبلی او بسته می‌شود.</p><Field label="رمز جدید" hint="رمز قبلی قابل مشاهده نیست؛ سرور فقط نسخه هش‌شده را نگه می‌دارد."><div className="password-input"><input dir="ltr" type={showPassword?'text':'password'} value={newPassword} onChange={e=>{setNewPassword(e.target.value);setShowPassword(false)}}/><button type="button" className="icon-button" onClick={()=>{if(showPassword)setShowPassword(false);else if(window.confirm('رمز اطلاعات حساس است. نمایش داده شود؟'))setShowPassword(true)}}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button><button type="button" className="icon-button" onClick={()=>{setNewPassword(makePassword());setShowPassword(false)}}><RefreshCw size={17}/></button></div></Field><div className="dialog-actions"><button className="button button--ghost" onClick={()=>setPasswordTarget(null)}>انصراف</button><button className="button button--primary" disabled={busy} onClick={resetPassword}><KeyRound size={17}/>تغییر رمز</button></div></div>}
    </Modal>

    <Modal open={Boolean(oneTimePassword)} title="رمز عبور آماده است" onClose={()=>{setOneTimePassword(null);setOneTimeRevealed(false)}}>
      {oneTimePassword&&<div className="one-time-password"><ShieldCheck size={28}/><strong>{oneTimePassword.employee}</strong><p>رمز روی سرور قابل بازیابی نیست. برای مشاهده همین رمز تازه‌تنظیم‌شده ابتدا تأیید امنیتی را انجام دهید.</p><code dir="ltr">{oneTimeRevealed?oneTimePassword.password:'••••••••••••'}</code>{oneTimeRevealed?<button className="button button--primary" onClick={()=>void copyPassword(oneTimePassword.password)}><Copy size={17}/>کپی رمز</button>:<button className="button button--primary" onClick={()=>{if(window.confirm('رمز عبور اطلاعات حساس است. فقط وقتی مطمئن هستید کسی صفحه را نمی‌بیند نمایش داده شود. نمایش داده شود؟'))setOneTimeRevealed(true)}}><Eye size={17}/>نمایش رمز</button>}<button className="button button--ghost" onClick={()=>{setOneTimePassword(null);setOneTimeRevealed(false)}}>بستن و پاک کردن از صفحه</button></div>}
    </Modal>

    <Confirm open={Boolean(deleteTarget)} title="حذف کارمند" text="حساب کارمند و دسترسی او به پنل حذف می‌شود. این کار به کاربران، هنرمندان یا محتوای سایت آسیبی نمی‌زند." confirmLabel="حذف کارمند" danger busy={busy} onConfirm={removeEmployee} onClose={()=>setDeleteTarget(null)}/>
  </div>
}
