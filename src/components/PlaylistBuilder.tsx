import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  ArrowDown, ArrowUp, BarChart3, Check, ChevronsDown, ChevronsUp, Clock3,
  GripVertical, Heart, ListMusic, LoaderCircle, Music2, Plus, Search, Sparkles,
  Trash2, UsersRound, WandSparkles, X,
} from 'lucide-react'
import { ErrorState, Field, Modal, Pagination } from './Ui'
import { useToast } from './toastContext'
import { api, errorMessageFa, jsonBody, queryString } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import type { Paginated, Song } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { numberFa } from '../lib/format'

export type PlaylistRecord = {
  id:number
  title:string
  title_en?:string
  description?:string
  description_en?:string
  cover_image?:string|null
  created_by:string
  songs:number[]
  song_details?:Song[]
  genres?:number[]
  moods?:number[]
  tags?:number[]
  likes_count:number
  saves_count:number
  created_at:string
}

type Facet = { id:number; name:string; name_en?:string; count:number }
type BuilderSong = Song & { recent_plays?:number }
type DiscoveryResponse = Paginated<BuilderSong> & { source:string; facets:{genres:Facet[];moods:Facet[]} }
type FillMode = 'append'|'fill_to'|'replace'
type FillResponse = { mode:FillMode; source:string; requested_count:number; add_count:number; final_count:number; shortfall:number; songs:BuilderSong[] }

type Props = {
  open:boolean
  item:PlaylistRecord|null
  onClose:()=>void
  onSaved:(saved:PlaylistRecord)=>void|Promise<void>
}

const SOURCES = [
  ['trend7','ترند ۷ روز','پخش واقعی اخیر'],
  ['trend30','ترند ۳۰ روز','ترند پایدارتر'],
  ['plays','پربازدید','کل پخش'],
  ['likes','محبوب‌ترین','بیشترین پسند'],
  ['newest','جدیدترین','تازه منتشرشده'],
  ['metadata','متادیتای کامل','آماده الگوریتم'],
] as const

const FILL_MODES:{value:FillMode;label:string;hint:string}[] = [
  {value:'append',label:'افزودن دقیق',hint:'همین تعداد آهنگ به انتهای لیست اضافه می‌شود.'},
  {value:'fill_to',label:'تکمیل تا تعداد',hint:'فقط تا رسیدن کل پلی‌لیست به این عدد اضافه می‌کند.'},
  {value:'replace',label:'ساخت مجدد',hint:'لیست فعلی با همین تعداد نتیجه جایگزین می‌شود.'},
]

const uniqueSongs = (songs:BuilderSong[]) => {
  const seen = new Set<number>()
  return songs.filter(song => !seen.has(song.id) && seen.add(song.id))
}
const move = <T,>(items:T[], from:number, to:number) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next=[...items]; const [item]=next.splice(from,1); next.splice(to,0,item); return next
}
const durationFa = (seconds:number) => {
  const mins=Math.floor(seconds/60); const hours=Math.floor(mins/60); const rest=mins%60
  return hours ? `${numberFa(hours)} س ${numberFa(rest)} د` : `${numberFa(rest)} دقیقه`
}
const dominant = (songs:BuilderSong[], key:'genre_names'|'mood_names') => {
  const counts=new Map<string,number>()
  songs.flatMap(song => song[key] || []).forEach(name=>counts.set(name,(counts.get(name)||0)+1))
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([name,count])=>`${name} ${numberFa(count)}`)
}
const topFacetIds = (songs:BuilderSong[], key:'genre_names'|'mood_names', facets:Facet[], limit=3) => {
  const counts=new Map<string,number>()
  songs.flatMap(song=>song[key]||[]).forEach(name=>counts.set(name,(counts.get(name)||0)+1))
  const names=new Set([...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([name])=>name))
  return facets.filter(facet=>names.has(facet.name)||Boolean(facet.name_en&&names.has(facet.name_en))).map(facet=>facet.id)
}

function FacetChips({items,selected,onToggle}:{items:Facet[];selected:number[];onToggle:(id:number)=>void}) {
  return <div className="playlist-builder__chips">
    {items.slice(0,18).map(item=><button key={item.id} type="button" className={selected.includes(item.id)?'filter-chip is-active':'filter-chip'} onClick={()=>onToggle(item.id)} title={item.name_en||item.name}>
      <span>{item.name}</span><small>{numberFa(item.count)}</small>
    </button>)}
  </div>
}

function CandidateRow({song,selected,onAdd}:{song:BuilderSong;selected:boolean;onAdd:()=>void}) {
  const drag=useDraggable({id:`candidate-${song.id}`,type:'candidate',data:{song},disabled:selected})
  return <div ref={drag.ref} className={`builder-song ${drag.isDragging?'is-dragging':''} ${selected?'is-selected':''}`}>
    <button type="button" ref={drag.handleRef} className="builder-song__grip" disabled={selected} aria-label="کشیدن آهنگ به پلی‌لیست"><GripVertical size={16}/></button>
    <div className="builder-song__art">{song.cover_image?<img src={song.cover_image} alt="" loading="lazy"/>:<Music2 size={17}/>}</div>
    <div className="builder-song__main"><strong>{song.title}</strong><span>{song.artist_name}</span><div className="builder-song__tags">{(song.genre_names||[]).slice(0,2).map(x=><i key={x}>{x}</i>)}{(song.mood_names||[]).slice(0,1).map(x=><i key={x}>{x}</i>)}</div></div>
    <div className="builder-song__metrics"><span title="پخش"><BarChart3 size={13}/>{numberFa(song.plays||0)}</span><span title="پسند"><Heart size={13}/>{numberFa(song.likes_count||0)}</span><span title="کامل بودن متادیتا">{numberFa(song.metadata_completion||0)}٪</span></div>
    <button type="button" className={selected?'icon-button icon-button--sm is-success':'icon-button icon-button--sm'} onClick={onAdd} disabled={selected} aria-label={selected?'در پلی‌لیست است':'افزودن به پلی‌لیست'}>{selected?<Check size={16}/>:<Plus size={16}/>}</button>
  </div>
}

function QueueRow({song,index,count,onRemove,onMove}:{song:BuilderSong;index:number;count:number;onRemove:()=>void;onMove:(to:number)=>void}) {
  const sort=useSortable({id:`playlist-${song.id}`,index,group:'playlist',type:'playlist-track',accept:['playlist-track','candidate']})
  return <div ref={sort.ref} className={`builder-song builder-song--queue ${sort.isDragging?'is-dragging':''} ${sort.isDropTarget?'is-drop-target':''}`}>
    <span className="builder-song__position">{numberFa(index+1)}</span>
    <button type="button" ref={sort.handleRef} className="builder-song__grip" aria-label={`جابجایی ${song.title}`}><GripVertical size={16}/></button>
    <div className="builder-song__art">{song.cover_image?<img src={song.cover_image} alt="" loading="lazy"/>:<Music2 size={17}/>}</div>
    <div className="builder-song__main"><strong>{song.title}</strong><span>{song.artist_name}</span></div>
    <span className="builder-song__meta-score">{numberFa(song.metadata_completion||0)}٪</span>
    <div className="builder-song__queue-actions">
      <button type="button" className="icon-button icon-button--xs" disabled={index===0} onClick={()=>onMove(0)} title="انتقال به اول"><ChevronsUp size={14}/></button>
      <button type="button" className="icon-button icon-button--xs" disabled={index===0} onClick={()=>onMove(index-1)} title="یک ردیف بالا"><ArrowUp size={14}/></button>
      <button type="button" className="icon-button icon-button--xs" disabled={index===count-1} onClick={()=>onMove(index+1)} title="یک ردیف پایین"><ArrowDown size={14}/></button>
      <button type="button" className="icon-button icon-button--xs" disabled={index===count-1} onClick={()=>onMove(count-1)} title="انتقال به آخر"><ChevronsDown size={14}/></button>
      <button type="button" className="icon-button icon-button--xs icon-button--danger" onClick={onRemove} title="حذف از پلی‌لیست"><X size={14}/></button>
    </div>
  </div>
}

function QueueDropzone({children,empty}:{children:ReactNode;empty:boolean}) {
  const drop=useDroppable({id:'playlist-dropzone',accept:['candidate','playlist-track']})
  return <div ref={drop.ref} className={`playlist-builder__queue ${drop.isDropTarget?'is-drop-target':''}`}>
    {empty?<div className="playlist-builder__empty"><ListMusic size={25}/><strong>پلی‌لیست هنوز خالی است</strong><span>آهنگ اضافه کنید یا نتیجه‌ای را از سمت کشف اینجا بکشید.</span></div>:children}
  </div>
}

export function PlaylistBuilder({open,item,onClose,onSaved}:Props) {
  const toast=useToast()
  const [title,setTitle]=useState(item?.title||''); const [titleEn,setTitleEn]=useState(item?.title_en||''); const [desc,setDesc]=useState(item?.description||''); const [descEn,setDescEn]=useState(item?.description_en||''); const [cover,setCover]=useState<File|null>(null)
  const [selected,setSelected]=useState<BuilderSong[]>(()=>[...((item?.song_details||[]) as BuilderSong[])]); const [loadingDetail,setLoadingDetail]=useState(Boolean(item)); const [saving,setSaving]=useState(false)
  const [search,setSearch]=useState(''); const q=useDebouncedValue(search); const [source,setSource]=useState('trend7'); const [genreIds,setGenreIds]=useState<number[]>([]); const [moodIds,setMoodIds]=useState<number[]>([]); const [minMeta,setMinMeta]=useState(0); const [page,setPage]=useState(1)
  const [fillMode,setFillMode]=useState<FillMode>('append'); const [fillCount,setFillCount]=useState(20); const [maxArtist,setMaxArtist]=useState(0); const [filling,setFilling]=useState(false); const [fillReport,setFillReport]=useState<FillResponse|null>(null)

  const discoveryPath=open?'/admin/playlist-builder/'+queryString({q,source,genres:genreIds.join(','),moods:moodIds.join(','),min_meta:minMeta,page,page_size:30}):null
  const discovery=useRemote<DiscoveryResponse>(discoveryPath)
  const results=discovery.data?.results||[]
  const selectedIds=useMemo(()=>new Set(selected.map(song=>song.id)),[selected])

  useEffect(()=>{
    if(!item)return
    let alive=true
    void api<PlaylistRecord>(`/admin/playlists/${item.id}/`).then(detail=>{if(alive){setTitle(detail.title||'');setTitleEn(detail.title_en||'');setDesc(detail.description||'');setDescEn(detail.description_en||'');setSelected((detail.song_details||[]) as BuilderSong[])}}).catch(err=>{if(alive){setSelected([]);toast.show(errorMessageFa(err,'جزئیات پلی‌لیست دریافت نشد.'),'error')}}).finally(()=>{if(alive)setLoadingDetail(false)})
    return()=>{alive=false}
  },[item,toast])

  const health=useMemo(()=>{
    const totalDuration=selected.reduce((sum,song)=>sum+Number(song.duration_seconds||0),0)
    const artists=new Set(selected.map(song=>Number(song.artist))).size
    const avgMeta=selected.length?Math.round(selected.reduce((sum,song)=>sum+Number(song.metadata_completion||0),0)/selected.length):0
    return {totalDuration,artists,avgMeta,genres:dominant(selected,'genre_names'),moods:dominant(selected,'mood_names')}
  },[selected])

  const toggle=(current:number[],id:number)=>current.includes(id)?current.filter(x=>x!==id):[...current,id]
  const resetPage=()=>setPage(1)
  const addSong=(song:BuilderSong,index=selected.length)=>setSelected(current=>{
    if(current.some(x=>x.id===song.id))return current
    const next=[...current]; next.splice(Math.max(0,Math.min(index,next.length)),0,song); return next
  })
  const removeSong=(id:number)=>setSelected(current=>current.filter(song=>song.id!==id))
  const moveSong=(from:number,to:number)=>setSelected(current=>move(current,from,to))
  const addResultPage=()=>{
    const additions=results.filter(song=>!selectedIds.has(song.id))
    if(!additions.length){toast.show('همه نتایج این صفحه از قبل داخل پلی‌لیست هستند.','info');return}
    setSelected(current=>uniqueSongs([...current,...additions]));toast.show(`${numberFa(additions.length)} آهنگ این صفحه اضافه شد.`,'success')
  }
  const useCurrentMix=()=>{
    if(!selected.length){toast.show('ابتدا چند آهنگ به پلی‌لیست اضافه کنید.','info');return}
    const facets=discovery.data?.facets
    if(!facets){toast.show('فهرست ژانر و حال‌وهوا هنوز آماده نیست.','info');return}
    const nextGenres=topFacetIds(selected,'genre_names',facets.genres)
    const nextMoods=topFacetIds(selected,'mood_names',facets.moods)
    if(!nextGenres.length&&!nextMoods.length){toast.show('در آهنگ‌های فعلی ژانر یا حال‌وهوای قابل استفاده پیدا نشد.','info');return}
    setGenreIds(nextGenres);setMoodIds(nextMoods);setPage(1)
    toast.show('ترکیب غالب پلی‌لیست به فیلترهای کشف منتقل شد.','success')
  }

  async function smartFill(){
    setFilling(true);setFillReport(null)
    try{
      const response=await api<FillResponse>('/admin/playlist-builder/',{method:'POST',body:jsonBody({mode:fillMode,count:fillCount,existing_ids:selected.map(song=>song.id),q,source,genres:genreIds,moods:moodIds,min_meta:minMeta,max_per_artist:maxArtist})})
      const incoming=response.songs||[]
      setSelected(current=>fillMode==='replace'?uniqueSongs(incoming):uniqueSongs([...current,...incoming]))
      setFillReport(response)
      if(response.shortfall) toast.show(`با محدودیت‌های فعلی ${numberFa(response.shortfall)} آهنگ کمتر از تعداد خواسته‌شده پیدا شد.`,'info')
      else toast.show(`${numberFa(response.add_count)} آهنگ با موفقیت انتخاب شد.`,'success')
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setFilling(false)}
  }

  async function submit(e:FormEvent){
    e.preventDefault()
    if(!title.trim()||!titleEn.trim()){toast.show('عنوان فارسی و انگلیسی را کامل کنید.','error');return}
    setSaving(true)
    try{
      const form=new FormData();form.append('title',title.trim());form.append('title_en',titleEn.trim());form.append('description',desc);form.append('description_en',descEn);selected.forEach(song=>form.append('song_ids',String(song.id)));if(cover)form.append('cover_image_upload',cover)
      const response=await api<PlaylistRecord>(item?`/admin/playlists/${item.id}/`:'/admin/playlists/',{method:item?'PATCH':'POST',body:form})
      const saved:PlaylistRecord={...response,title:title.trim(),title_en:titleEn.trim(),description:desc,description_en:descEn,songs:selected.map(song=>song.id),song_details:[...selected]}
      toast.show(item?'پلی‌لیست به‌روزرسانی شد.':'پلی‌لیست رسمی ایجاد شد.','success');await onSaved(saved)
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setSaving(false)}
  }

  return <Modal open={open} title={item?'ویرایش پلی‌لیست رسمی':'ساخت پلی‌لیست رسمی'} onClose={onClose} workspace>
    <form className="playlist-builder" onSubmit={submit}>
      <div className="playlist-builder__identity">
        <div className="playlist-builder__title-fields"><Field label="عنوان فارسی"><input value={title} onChange={e=>setTitle(e.target.value)} required/></Field><Field label="عنوان انگلیسی"><input dir="ltr" value={titleEn} onChange={e=>setTitleEn(e.target.value)} required/></Field></div>
        <label className="playlist-builder__cover"><input type="file" accept="image/*" onChange={e=>setCover(e.target.files?.[0]||null)}/><Music2 size={17}/><span>{cover?cover.name:item?.cover_image?'تعویض کاور':'انتخاب کاور'}</span></label>
        <details className="playlist-builder__details"><summary>توضیحات پلی‌لیست</summary><div><Field label="توضیح فارسی"><textarea rows={2} value={desc} onChange={e=>setDesc(e.target.value)}/></Field><Field label="توضیح انگلیسی"><textarea rows={2} dir="ltr" value={descEn} onChange={e=>setDescEn(e.target.value)}/></Field></div></details>
      </div>

      <div className="playlist-builder__health" aria-label="وضعیت پلی‌لیست">
        <span><ListMusic size={15}/><b>{numberFa(selected.length)}</b> آهنگ</span><span><Clock3 size={15}/>{durationFa(health.totalDuration)}</span><span><UsersRound size={15}/>{numberFa(health.artists)} هنرمند</span><span><Sparkles size={15}/>{numberFa(health.avgMeta)}٪ متادیتا</span>
        {health.genres.length>0&&<span className="playlist-builder__health-tags">{health.genres.join(' · ')}</span>}{health.moods.length>0&&<span className="playlist-builder__health-tags">{health.moods.join(' · ')}</span>}
      </div>

      <DragDropProvider onDragEnd={(event)=>{
        if(event.canceled)return
        const {source:dragSource,target}=event.operation
        if(isSortable(dragSource)&&String(dragSource.id).startsWith('playlist-')){
          if(dragSource.initialIndex!==dragSource.index)moveSong(dragSource.initialIndex,dragSource.index)
          return
        }
        const sourceId=String(dragSource?.id||'')
        if(!sourceId.startsWith('candidate-')||!target)return
        const id=Number(sourceId.slice('candidate-'.length)); const song=results.find(x=>x.id===id); if(!song)return
        const at=isSortable(target)&&target.group==='playlist'?target.index:selected.length
        addSong(song,at)
      }}>
        <div className="playlist-builder__workspace">
          <section className="playlist-builder__pane playlist-builder__pane--discover">
            <header className="playlist-builder__pane-head"><div><strong>کشف و تأمین آهنگ</strong><span>جستجو، فیلتر و رتبه‌بندی روی آهنگ‌های منتشرشده</span></div><div className="playlist-builder__head-actions"><button type="button" className="button button--ghost button--compact" disabled={!selected.length} onClick={useCurrentMix}><Sparkles size={14}/>ترکیب فعلی</button><button type="button" className="button button--ghost button--compact" disabled={!results.some(song=>!selectedIds.has(song.id))} onClick={addResultPage}><Plus size={14}/>افزودن این صفحه</button><span className="count-pill">{numberFa(discovery.data?.count||0)} نتیجه</span></div></header>
            <label className="search-box search-box--field"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);resetPage()}} placeholder="نام فارسی یا انگلیسی آهنگ / هنرمند"/><button type="button" className={search?'search-box__clear is-visible':'search-box__clear'} onClick={()=>{setSearch('');resetPage()}} aria-label="پاک کردن"><X size={14}/></button></label>
            <div className="playlist-builder__sources">{SOURCES.map(([value,label,hint])=><button type="button" key={value} className={source===value?'source-chip is-active':'source-chip'} onClick={()=>{setSource(value);resetPage()}}><strong>{label}</strong><small>{hint}</small></button>)}</div>

            <div className="playlist-builder__filters">
              <details><summary>ژانر {genreIds.length>0&&<b>{numberFa(genreIds.length)}</b>}</summary><FacetChips items={discovery.data?.facets.genres||[]} selected={genreIds} onToggle={id=>{setGenreIds(x=>toggle(x,id));resetPage()}}/></details>
              <details><summary>حال‌وهوا {moodIds.length>0&&<b>{numberFa(moodIds.length)}</b>}</summary><FacetChips items={discovery.data?.facets.moods||[]} selected={moodIds} onToggle={id=>{setMoodIds(x=>toggle(x,id));resetPage()}}/></details>
              <label className="compact-select"><span>حداقل متادیتا</span><select value={minMeta} onChange={e=>{setMinMeta(Number(e.target.value));resetPage()}}><option value={0}>بدون محدودیت</option><option value={50}>۵۰٪+</option><option value={70}>۷۰٪+</option><option value={85}>۸۵٪+</option><option value={100}>۱۰۰٪</option></select></label>
            </div>

            <div className="smart-fill">
              <div className="smart-fill__title"><WandSparkles size={17}/><div><strong>تکمیل هوشمند</strong><span>همین جستجو و فیلترهای بالا مبنای انتخاب هستند.</span></div></div>
              <div className="smart-fill__controls">
                <select value={fillMode} onChange={e=>setFillMode(e.target.value as FillMode)}>{FILL_MODES.map(mode=><option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
                <label><span>تعداد</span><input type="number" min={1} max={500} value={fillCount} onChange={e=>setFillCount(Math.max(1,Math.min(500,Number(e.target.value)||1)))}/></label>
                <label><span>حداکثر از هر هنرمند</span><select value={maxArtist} onChange={e=>setMaxArtist(Number(e.target.value))}><option value={0}>نامحدود</option><option value={1}>۱ آهنگ</option><option value={2}>۲ آهنگ</option><option value={3}>۳ آهنگ</option><option value={5}>۵ آهنگ</option></select></label>
                <button type="button" className="button button--primary smart-fill__run" disabled={filling} onClick={()=>void smartFill()}>{filling?<LoaderCircle className="spin" size={16}/>:<WandSparkles size={16}/>}اجرا</button>
              </div>
              <small>{FILL_MODES.find(x=>x.value===fillMode)?.hint}</small>
              {fillReport&&<div className={fillReport.shortfall?'smart-fill__report has-warning':'smart-fill__report'}><span>افزوده: <b>{numberFa(fillReport.add_count)}</b></span><span>تعداد نهایی: <b>{numberFa(fillReport.final_count)}</b></span>{fillReport.shortfall>0&&<span>کسری: <b>{numberFa(fillReport.shortfall)}</b></span>}</div>}
            </div>

            <div className="playlist-builder__results">
              {discovery.error?<ErrorState message={discovery.error} retry={()=>void discovery.reload()}/>:discovery.loading?<div className="builder-inline-loading"><LoaderCircle className="spin" size={18}/>در حال آماده‌سازی پیشنهادها…</div>:results.length===0?<div className="playlist-builder__empty"><Search size={22}/><strong>نتیجه‌ای برای این ترکیب نیست</strong><span>فیلترها یا عبارت جستجو را تغییر دهید.</span></div>:results.map(song=><CandidateRow key={song.id} song={song} selected={selectedIds.has(song.id)} onAdd={()=>addSong(song)}/>)}
            </div>
            {discovery.data&&<Pagination count={discovery.data.count} page={page} pageSize={30} onPage={setPage}/>}          
          </section>

          <section className="playlist-builder__pane playlist-builder__pane--queue">
            <header className="playlist-builder__pane-head"><div><strong>ترتیب نهایی پلی‌لیست</strong><span>دستگیره را بکشید؛ ترتیب دقیق ذخیره و به کاربر نمایش داده می‌شود.</span></div>{selected.length>0&&<button type="button" className="button button--ghost button--compact" onClick={()=>setSelected([])}><Trash2 size={14}/>پاک‌کردن</button>}</header>
            {loadingDetail?<div className="builder-inline-loading"><LoaderCircle className="spin" size={18}/>در حال دریافت آهنگ‌های پلی‌لیست…</div>:<QueueDropzone empty={selected.length===0}>{selected.map((song,index)=><QueueRow key={song.id} song={song} index={index} count={selected.length} onRemove={()=>removeSong(song.id)} onMove={to=>moveSong(index,to)}/>)}</QueueDropzone>}
          </section>
        </div>
      </DragDropProvider>

      <footer className="playlist-builder__footer"><span>{selected.length?`${numberFa(selected.length)} آهنگ آماده ذخیره است.`:'ذخیره پلی‌لیست خالی هم مجاز است.'}</span><div><button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>انصراف</button><button className="button button--primary" disabled={saving||loadingDetail}>{saving?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}ذخیره پلی‌لیست</button></div></footer>
    </form>
  </Modal>
}
