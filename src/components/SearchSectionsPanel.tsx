import { useState, type FormEvent } from 'react'
import { ImagePlus, LayoutGrid, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Card, Confirm, ErrorState, Field, Modal, Pagination, SearchBox } from './Ui'
import { DataTable } from './DataTable'
import { ProductSelect } from './ProductSelect'
import { useToast } from './toastContext'
import { api, errorMessageFa, queryString } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { useRemote } from '../lib/useRemote'
import { numberFa } from '../lib/format'
import type { Paginated, Song } from '../lib/types'
import type { PlaylistRecord } from './PlaylistBuilder'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type SectionType='song'|'album'|'playlist'
type SectionItem={id:number;title:string;subtitle?:string;image?:string|null}
type SearchSection={id:number;type:SectionType;title:string;title_en?:string;icon_logo?:string|null;item_size:'small'|'medium'|'big';songs:number[];albums:number[];playlists:number[];item_count:number;item_details:SectionItem[]}
type AlbumResult={id:number;title:string;artist_name?:string;cover_image?:string|null}
type Candidate=Song|AlbumResult|PlaylistRecord

const typeLabel=(type:SectionType)=>type==='song'?'آهنگ':type==='album'?'آلبوم':'پلی‌لیست'
const sizeLabel=(size:string)=>size==='small'?'کوچک':size==='big'?'بزرگ':'متوسط'
const asItem=(value:Candidate,type:SectionType):SectionItem=>({id:value.id,title:value.title,subtitle:type==='song'?(value as Song).artist_name:type==='album'?(value as AlbumResult).artist_name||'':'',image:(value as Song|AlbumResult|PlaylistRecord).cover_image})

export function SearchSectionsPanel({canManage=true}:{canManage?:boolean}){
  const toast=useToast();const[page,setPage]=useState(1);const[search,setSearch]=useState('');const q=useDebouncedValue(search);const[open,setOpen]=useState(false);const[editing,setEditing]=useState<SearchSection|null>(null);const[del,setDel]=useState<SearchSection|null>(null);const[busy,setBusy]=useState(false)
  const remote=useRemote<Paginated<SearchSection>>('/admin/sections/'+queryString({q,page,page_size:20}))
  const sectionVisible=(item:SearchSection)=>{const needle=q.trim().toLocaleLowerCase();return !needle||`${item.title||''} ${item.title_en||''}`.toLocaleLowerCase().includes(needle)}
  const syncSection=(item:SearchSection|number,snapshot=pageSnapshot(remote.data,typeof item==='number'?item:item.id),allowInsert=true,expect?:'missing'|'saved')=>{const id=typeof item==='number'?item:item.id;void verifyExactEntity<SearchSection>(`/admin/sections/${id}/`,{found:server=>remote.setData(current=>setPaginatedItem(current,server,{visible:sectionVisible(server)&&(snapshot.index>=0||allowInsert),indexHint:snapshot.index})),missing:()=>remote.setData(current=>removePaginatedItem(current,id))},expect==='missing'?{stopOnMissing:true}:expect==='saved'&&typeof item!=='number'?{stopWhenFound:server=>mutationFieldsMatch(server,item,['title','title_en','type','item_size','songs','albums','playlists'])}:{}).then(outcome=>{if(outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})}
  async function remove(){if(!del)return;const target=del;const snapshot=pageSnapshot(remote.data,target.id);setBusy(true);try{await api(`/admin/sections/${target.id}/`,{method:'DELETE'});remote.setData(current=>removePaginatedItem(current,target.id));if(editing?.id===target.id){setEditing(null);setOpen(false)};toast.show('بخش جستجو حذف شد.','success');setDel(null);syncSection(target.id,snapshot,false,'missing')}catch(err){toast.show(errorMessageFa(err),'error')}finally{setBusy(false)}}
  const savedSection=(saved:SearchSection)=>{const snapshot=pageSnapshot(remote.data,saved.id);const isCreate=snapshot.index<0;const visible=sectionVisible(saved)&&(!isCreate||page===1);const preferred=isCreate&&visible?[saved.id,...snapshot.order]:snapshot.order;remote.setData(current=>setPaginatedItem(current,saved,{visible,indexHint:isCreate?0:snapshot.index}));setEditing(null);setOpen(false);syncSection(saved,{...snapshot,order:preferred},visible,'saved')}
  return <>
    <div className="section-actions"><div><strong>بخش‌های صفحه جستجو</strong><span>کنترل ردیف‌هایی که کاربر در Search می‌بیند و محتوای هر ردیف</span></div>{canManage&&<button className="button button--primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={16}/>بخش جدید</button>}</div>
    <Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="عنوان فارسی یا انگلیسی بخش"/></Card>
    <Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<SearchSection> loading={remote.loading} rows={remote.data?.results||[]} emptyTitle="بخشی برای صفحه جستجو ثبت نشده است" columns={[
      {key:'section',title:'بخش',render:x=><div className="media-cell">{x.icon_logo?<img src={x.icon_logo} alt="" loading="lazy"/>:<div className="media-placeholder"><LayoutGrid size={17}/></div>}<div><strong>{x.title}</strong><span>{typeLabel(x.type)} · {sizeLabel(x.item_size)}</span></div></div>},
      {key:'items',title:'محتوا',render:x=><span>{numberFa(x.item_count||0)} {typeLabel(x.type)}</span>},
      ...(canManage?[{key:'actions',title:'عملیات',render:(x:SearchSection)=><div className="row-actions"><button className="icon-button" onClick={()=>{setEditing(x);setOpen(true)}} aria-label="ویرایش بخش"><Pencil size={16}/></button><button className="icon-button icon-button--danger" onClick={()=>setDel(x)} aria-label="حذف بخش"><Trash2 size={16}/></button></div>}]:[]),
    ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card>
    {canManage&&open&&<SectionEditor open item={editing} onClose={()=>setOpen(false)} onSaved={savedSection}/>}
    <Confirm open={Boolean(del)} title="حذف بخش جستجو" text={`بخش «${del?.title||''}» حذف شود؟`} confirmLabel="حذف" danger busy={busy} onClose={()=>setDel(null)} onConfirm={()=>void remove()}/>
  </>
}

function SectionEditor({open,item,onClose,onSaved}:{open:boolean;item:SearchSection|null;onClose:()=>void;onSaved:(saved:SearchSection)=>void|Promise<void>}){
  const toast=useToast();const[busy,setBusy]=useState(false);const[title,setTitle]=useState(item?.title||'');const[titleEn,setTitleEn]=useState(item?.title_en||'');const[type,setType]=useState<SectionType>(item?.type||'song');const[size,setSize]=useState<'small'|'medium'|'big'>(item?.item_size||'medium');const[icon,setIcon]=useState<File|null>(null);const[selected,setSelected]=useState<SectionItem[]>(item?.item_details||[]);const[search,setSearch]=useState('');const q=useDebouncedValue(search)
  const resultPath=open?(type==='song'?'/admin/songs/'+queryString({q,status:'published',page_size:16}):type==='album'?'/admin/albums/'+queryString({q,page_size:16}):'/admin/playlists/'+queryString({q,page_size:16})):null
  const results=useRemote<Paginated<Candidate>>(resultPath)
  const selectedIds=new Set(selected.map(x=>x.id))
  const changeType=(next:SectionType)=>{if(next===type)return;setType(next);setSelected([]);setSearch('')}
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);try{const form=new FormData();form.append('title',title);form.append('title_en',titleEn);form.append('type',type);form.append('item_size',size);form.append('item_ids',selected.map(x=>x.id).join(','));if(icon)form.append('icon_logo_upload',icon);const response=await api<SearchSection>(item?`/admin/sections/${item.id}/`:'/admin/sections/',{method:item?'PATCH':'POST',body:form});const itemIds=selected.map(x=>x.id);const saved:SearchSection={...response,title,title_en:titleEn,type,item_size:size,item_count:selected.length,item_details:[...selected],songs:type==='song'?itemIds:[],albums:type==='album'?itemIds:[],playlists:type==='playlist'?itemIds:[]};toast.show(item?'بخش جستجو به‌روزرسانی شد.':'بخش جستجو ساخته شد.','success');await onSaved(saved)}catch(err){toast.show(errorMessageFa(err),'error')}finally{setBusy(false)}}
  return <Modal open={open} title={item?'ویرایش بخش صفحه جستجو':'بخش جدید صفحه جستجو'} onClose={onClose} wide><form className="form-grid" onSubmit={submit}>
    <Field label="عنوان فارسی"><input value={title} onChange={e=>setTitle(e.target.value)} required/></Field><Field label="عنوان انگلیسی"><input dir="ltr" value={titleEn} onChange={e=>setTitleEn(e.target.value)} required/></Field>
    <Field label="نوع محتوا"><ProductSelect ariaLabel="نوع محتوای بخش جستجو" value={type} onValueChange={value=>changeType(value as SectionType)} options={[{value:'song',label:'آهنگ'},{value:'album',label:'آلبوم'},{value:'playlist',label:'پلی‌لیست'}]}/></Field><Field label="اندازه کارت در اپ"><ProductSelect ariaLabel="اندازه کارت بخش جستجو" value={size} onValueChange={value=>setSize(value as typeof size)} options={[{value:'small',label:'کوچک'},{value:'medium',label:'متوسط'},{value:'big',label:'بزرگ'}]}/></Field>
    <div className="form-grid__full"><Field label="آیکون بخش" hint={item?'اگر فایل جدید انتخاب نشود، آیکون فعلی حفظ می‌شود.':'اختیاری'}><input type="file" accept="image/*" onChange={e=>setIcon(e.target.files?.[0]||null)}/></Field></div>
    <div className="form-grid__full section-item-manager"><div className="section-item-manager__head"><div><strong>محتوای این بخش</strong><span>{numberFa(selected.length)} مورد انتخاب شده</span></div>{selected.length>0&&<button type="button" className="button button--ghost button--compact" onClick={()=>setSelected([])}>پاک‌کردن همه</button>}</div>
      {selected.length>0&&<div className="section-selected-items">{selected.map(value=><div key={value.id} className="section-selected-item"><span className="section-selected-item__art">{value.image?<img src={value.image} alt=""/>:<ImagePlus size={15}/>}</span><span><strong>{value.title}</strong><small>{value.subtitle}</small></span><button type="button" className="icon-button icon-button--xs" onClick={()=>setSelected(current=>current.filter(x=>x.id!==value.id))} aria-label="حذف"><X size={13}/></button></div>)}</div>}
      <label className="search-box search-box--field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`جستجوی ${typeLabel(type)} برای افزودن`}/></label>
      {results.error?<ErrorState message={results.error} retry={()=>void results.reload()}/>:results.loading?<div className="builder-inline-loading">در حال دریافت محتوا…</div>:<div className="section-candidate-grid">{(results.data?.results||[]).map(raw=>{const value=asItem(raw,type);const chosen=selectedIds.has(value.id);return <button type="button" key={value.id} className={chosen?'section-candidate is-selected':'section-candidate'} disabled={chosen} onClick={()=>setSelected(current=>[...current,value])}><span className="section-candidate__art">{value.image?<img src={value.image} alt="" loading="lazy"/>:<Music2 size={16}/>}</span><span><strong>{value.title}</strong><small>{value.subtitle||typeLabel(type)}</small></span>{chosen?<span className="section-candidate__check">انتخاب شده</span>:<Plus size={15}/>}</button>})}</div>}
    </div>
    <div className="dialog-actions form-grid__full"><button type="button" className="button button--ghost" onClick={onClose}>انصراف</button><button className="button button--primary" disabled={busy}>{busy?'در حال ذخیره…':'ذخیره بخش'}</button></div>
  </form></Modal>
}
