import { useState, type ReactNode } from 'react'
import { LayoutGrid, ListMusic, Music2, Pencil, Plus, Trash2 } from 'lucide-react'
import { PlaylistBuilder, type PlaylistRecord } from '../components/PlaylistBuilder'
import { SearchSectionsPanel } from '../components/SearchSectionsPanel'
import { TimeOfDayPlaylistsPanel } from '../components/TimeOfDayPlaylistsPanel'
import { DataTable } from '../components/DataTable'
import { Card, Confirm, ErrorState, PageHeader, Pagination } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, queryString } from '../lib/api'
import { dateTimeFa, numberFa } from '../lib/format'
import type { Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type Tab = 'playlists' | 'sections'
type DeleteTarget = { id:number; title:string } | null

function TabButton({ active, onClick, icon, children }:{active:boolean;onClick:()=>void;icon:ReactNode;children:ReactNode}) {
  return <button className={active ? 'content-tab is-active' : 'content-tab'} onClick={onClick}>{icon}<span>{children}</span></button>
}

export default function PlaylistsSectionsPage() {
  const {user}=useAuth();const canOfficial=can(user,'playlists.playlists'),canSections=can(user,'playlists.sections')
  const [tab, setTab] = useState<Tab>('playlists')
  return <div className="page-stack">
    <PageHeader title="پلی‌لیست‌ها و بخش‌ها" description="پلی‌لیست‌های رسمی و چیدمان بخش‌های صفحه جستجو" />
    <div className="content-tabs" role="tablist" aria-label="پلی‌لیست‌ها و بخش‌های جستجو">
      <TabButton active={tab==='playlists'} onClick={()=>setTab('playlists')} icon={<ListMusic size={18}/>}>پلی‌لیست‌ها</TabButton>
      <TabButton active={tab==='sections'} onClick={()=>setTab('sections')} icon={<LayoutGrid size={18}/>}>بخش‌های جستجو</TabButton>
    </div>
    {tab==='playlists' ? <PlaylistsPanel canManage={canOfficial} canManageSections={canSections}/> : <SearchSectionsPanel canManage={canSections}/>}
  </div>
}

function PlaylistsPanel({canManage,canManageSections}:{canManage:boolean;canManageSections:boolean}){
  const toast=useToast()
  const [page,setPage]=useState(1)
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<PlaylistRecord|null>(null)
  const [busy,setBusy]=useState(false)
  const [del,setDel]=useState<DeleteTarget>(null)
  const remote=useRemote<Paginated<PlaylistRecord>>('/admin/playlists/'+queryString({page,page_size:20}))

  const reconcilePlaylist=(item:PlaylistRecord|number,snapshot=pageSnapshot(remote.data,typeof item==='number'?item:item.id),visible=true,expect?:'missing'|'saved')=>{
    const id=typeof item==='number'?item:item.id
    void verifyExactEntity<PlaylistRecord>(`/admin/playlists/${id}/`,{
      found:server=>remote.setData(current=>setPaginatedItem(current,server,{visible,indexHint:snapshot.index})),
      missing:()=>remote.setData(current=>removePaginatedItem(current,id)),
    },expect==='missing'?{stopOnMissing:true}:expect==='saved'&&typeof item!=='number'?{stopWhenFound:server=>mutationFieldsMatch(server,item,['title','title_en','description','description_en','songs'])}:{}).then(outcome=>{if(outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
  }
  async function remove(){
    if(!del)return
    const target=del;const snapshot=pageSnapshot(remote.data,target.id)
    setBusy(true)
    try{
      await api(`/admin/playlists/${target.id}/`,{method:'DELETE'})
      remote.setData(current=>removePaginatedItem(current,target.id))
      if(editing?.id===target.id){setEditing(null);setOpen(false)}
      toast.show('پلی‌لیست حذف شد.','success')
      setDel(null)
      reconcilePlaylist(target.id,snapshot,true,'missing')
    }catch(e){toast.show(errorMessageFa(e),'error')}finally{setBusy(false)}
  }
  const savedPlaylist=(saved:PlaylistRecord)=>{
    const snapshot=pageSnapshot(remote.data,saved.id)
    const isCreate=snapshot.index<0
    const showImmediately=!isCreate||page===1
    const preferred=isCreate&&showImmediately?[saved.id,...snapshot.order]:snapshot.order
    remote.setData(current=>setPaginatedItem(current,saved,{visible:showImmediately,indexHint:isCreate?0:snapshot.index}))
    setEditing(null);setOpen(false)
    reconcilePlaylist(saved,{...snapshot,order:preferred},showImmediately,'saved')
  }

  return <>
    <TimeOfDayPlaylistsPanel canManage={canManageSections}/>
    <div className="section-actions">
      <div><strong>پلی‌لیست‌های رسمی</strong><span>مجموعه‌های منتخب ادمین برای نمایش در پلتفرم</span></div>
      {canManage&&<button className="button button--primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={17}/>پلی‌لیست جدید</button>}
    </div>
    <Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<>
      <DataTable<PlaylistRecord> loading={remote.loading} rows={remote.data?.results||[]} emptyTitle="پلی‌لیستی ثبت نشده است" columns={[
        {key:'name',title:'پلی‌لیست',render:x=><div className="media-cell">{x.cover_image?<img src={x.cover_image} alt="" loading="lazy"/>:<div className="media-placeholder"><Music2 size={18}/></div>}<div><strong>{x.title}</strong><span>{numberFa(x.songs?.length||0)} آهنگ</span></div></div>},
        {key:'engagement',title:'تعامل',render:x=><div className="stacked-text"><span>{numberFa(x.likes_count)} پسند</span><small>{numberFa(x.saves_count)} ذخیره</small></div>},
        {key:'created',title:'ایجاد',render:x=>dateTimeFa(x.created_at)},
        ...(canManage?[{key:'actions',title:'عملیات',render:(x:PlaylistRecord)=><div className="row-actions"><button className="icon-button" onClick={()=>{setEditing(x);setOpen(true)}} aria-label="ویرایش پلی‌لیست"><Pencil size={16}/></button><button className="icon-button icon-button--danger" onClick={()=>setDel({id:x.id,title:x.title})} aria-label="حذف پلی‌لیست"><Trash2 size={16}/></button></div>}]:[])
      ]}/>
      {remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}
    </>}</Card>
    {canManage&&open&&<PlaylistBuilder open item={editing} onClose={()=>setOpen(false)} onSaved={savedPlaylist}/>}
    <Confirm open={Boolean(del)} title="حذف پلی‌لیست" text={`پلی‌لیست «${del?.title||''}» حذف شود؟`} confirmLabel="حذف" danger busy={busy} onClose={()=>setDel(null)} onConfirm={()=>void remove()}/>
  </>
}
