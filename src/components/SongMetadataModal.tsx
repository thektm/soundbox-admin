import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, EyeOff, FileText, LoaderCircle, Music2, Save, Search, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react'
import { api, errorMessageFa } from '../lib/api'
import { numberFa } from '../lib/format'
import type { Song } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useToast } from './toastContext'
import { Confirm, Field, Modal, StatusBadge } from './Ui'

type Taxonomy = { id:number; name:string; name_en?:string; parent_genre?:number|null; parent_genre_name?:string|null }
type Draft = {
  title:string; title_en:string; description:string; description_en:string; lyrics:string; lyrics_en:string
  release_date:string; language:string; is_single:boolean; album_disc_number:string; album_track_number:string
  genres:number[]; sub_genres:number[]; moods:number[]; tags:number[]
  tempo:string; energy:string; danceability:string; valence:string; acousticness:string; instrumentalness:string; speechiness:string; live_performed:boolean
  label:string; label_en:string; producers:string; producers_en:string; composers:string; composers_en:string; lyricists:string; lyricists_en:string; credits:string; credits_en:string
}

type Props = { song:Song|null; initialPage?:1|2|3; onClose:()=>void; onSaved:(song:Song)=>Song|null|void|Promise<Song|null|void>; onRemoved?:(mode:'soft'|'hard')=>void|Promise<void>; allowSoftDelete?:boolean; allowHardDelete?:boolean }
const emptyDraft:Draft = {
  title:'',title_en:'',description:'',description_en:'',lyrics:'',lyrics_en:'',release_date:'',language:'fa',is_single:false,album_disc_number:'1',album_track_number:'1',
  genres:[],sub_genres:[],moods:[],tags:[],tempo:'',energy:'',danceability:'',valence:'',acousticness:'',instrumentalness:'',speechiness:'',live_performed:false,
  label:'',label_en:'',producers:'',producers_en:'',composers:'',composers_en:'',lyricists:'',lyricists_en:'',credits:'',credits_en:'',
}
const audioFields = [
  ['energy','انرژی'],['danceability','قابلیت رقص'],['valence','حس مثبت'],['acousticness','آکوستیک'],['instrumentalness','بی‌کلام'],['speechiness','گفتاری'],
] as const
const pages = [
  {id:1,label:'دسته‌بندی',icon:Tags},
  {id:2,label:'ویژگی صوتی',icon:SlidersHorizontal},
  {id:3,label:'اطلاعات و عوامل',icon:FileText},
] as const

const ids = (value:unknown) => Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []
const text = (value:unknown) => value == null ? '' : String(value)
const lines = (value:unknown) => Array.isArray(value) ? value.map(String).filter(Boolean).join('\n') : ''
const splitLines = (value:string) => value.split(/\r?\n|،|,/).map(x=>x.trim()).filter(Boolean)

function fromSong(song:Song):Draft {
  return {
    ...emptyDraft,
    title:text(song.title), title_en:text(song.title_en), description:text(song.description), description_en:text(song.description_en), lyrics:text(song.lyrics), lyrics_en:text(song.lyrics_en),
    release_date:text(song.release_date), language:text(song.language||'fa'), is_single:Boolean(song.is_single), album_disc_number:text(song.album_disc_number||1), album_track_number:text(song.album_track_number||1),
    genres:ids(song.genres), sub_genres:ids(song.sub_genres), moods:ids(song.moods), tags:ids(song.tags),
    tempo:text(song.tempo), energy:text(song.energy), danceability:text(song.danceability), valence:text(song.valence), acousticness:text(song.acousticness), instrumentalness:text(song.instrumentalness), speechiness:text(song.speechiness), live_performed:Boolean(song.live_performed),
    label:text(song.label), label_en:text(song.label_en), producers:lines(song.producers), producers_en:lines(song.producers_en), composers:lines(song.composers), composers_en:lines(song.composers_en), lyricists:lines(song.lyricists), lyricists_en:lines(song.lyricists_en), credits:text(song.credits), credits_en:text(song.credits_en),
  }
}

const taxonomyDraftKeys=new Set<keyof Draft>(['genres','sub_genres','moods','tags'])
const creditDraftKeys=new Set<keyof Draft>(['producers','producers_en','composers','composers_en','lyricists','lyricists_en'])
const numericDraftKeys=new Set<keyof Draft>(['album_disc_number','album_track_number','tempo','energy','danceability','valence','acousticness','instrumentalness','speechiness'])
function applyDraftToSong(base:Song,draft:Draft,keys:Array<keyof Draft>):Song{
  const next:Song={...base}
  keys.forEach(key=>{
    const value=draft[key]
    if(taxonomyDraftKeys.has(key)) next[String(key)]=[...(value as number[])]
    else if(creditDraftKeys.has(key)) next[String(key)]=splitLines(String(value))
    else if(numericDraftKeys.has(key)) next[String(key)]=value===''?null:Number(value)
    else next[String(key)]=value
  })
  return next
}

function metaScore(draft:Draft){
  const genre=draft.genres.length>0?1:0
  const mood=draft.moods.length>0?1:0
  const filled=['tempo','energy','danceability','valence','acousticness','instrumentalness','speechiness'].filter(key=>draft[key as keyof Draft] !== '').length/7
  return Math.round(((genre+mood+filled)/3)*100)
}

function TaxonomyPicker({title,items,selected,onChange,emptyText='موردی موجود نیست'}:{title:string;items:Taxonomy[];selected:number[];onChange:(ids:number[])=>void;emptyText?:string}){
  const [query,setQuery]=useState('')
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return q?items.filter(item=>`${item.name} ${item.name_en||''}`.toLowerCase().includes(q)):items
  },[items,query])
  const selectedSet=new Set(selected)
  const toggle=(id:number)=>onChange(selectedSet.has(id)?selected.filter(x=>x!==id):[...selected,id])
  return <section className="song-meta-taxonomy">
    <header><div><strong>{title}</strong><span>{numberFa(selected.length)} انتخاب</span></div>{selected.length>0&&<button type="button" onClick={()=>onChange([])}>پاک کردن</button>}</header>
    <label className="song-meta-taxonomy__search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`جستجوی ${title}`}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="پاک کردن"><X size={13}/></button>}</label>
    <div className="song-meta-taxonomy__chips">
      {filtered.length?filtered.map(item=><button type="button" key={item.id} className={selectedSet.has(item.id)?'is-selected':''} onClick={()=>toggle(item.id)}><span>{item.name}</span>{item.name_en&&item.name_en!==item.name?<small>{item.name_en}</small>:null}{selectedSet.has(item.id)&&<Check size={12}/>}</button>):<span className="song-meta-taxonomy__empty">{emptyText}</span>}
    </div>
  </section>
}

function AudioControl({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  const numeric=value===''?0:Math.max(0,Math.min(100,Number(value)||0))
  return <div className="song-audio-control">
    <div><strong>{label}</strong><span>{value===''?'—':numberFa(numeric)}</span></div>
    <input type="range" min="0" max="100" step="1" value={numeric} aria-label={label} aria-valuetext={value===''?'ثبت نشده':`${numeric} درصد`} onChange={e=>onChange(e.target.value)}/>
    <div className="song-audio-control__exact"><input type="number" min="0" max="100" value={value} onChange={e=>onChange(e.target.value)} placeholder="—"/><button type="button" onClick={()=>onChange('')}>پاک</button></div>
  </div>
}

export function SongMetadataModal({song,initialPage=1,onClose,onSaved,onRemoved,allowSoftDelete=false,allowHardDelete=false}:Props){
  const toast=useToast()
  const [detail,setDetail]=useState<Song|null>(song)
  const [draft,setDraft]=useState<Draft>(song?fromSong(song):emptyDraft)
  const [dirty,setDirty]=useState<Set<keyof Draft>>(new Set())
  const [page,setPage]=useState<1|2|3>(initialPage)
  const [loading,setLoading]=useState(Boolean(song))
  const [saving,setSaving]=useState(false)
  const [removeMode,setRemoveMode]=useState<'soft'|'hard'|null>(null)
  const [removing,setRemoving]=useState(false)
  const editVersion=useRef(0)
  const open=Boolean(song)
  const genres=useRemote<Taxonomy[]>(open?'/genres/':null)
  const subGenres=useRemote<Taxonomy[]>(open?'/subgenres/':null)
  const moods=useRemote<Taxonomy[]>(open?'/moods/':null)
  const tags=useRemote<Taxonomy[]>(open?'/tags/':null)

  useEffect(()=>{
    if(!song)return
    setPage(initialPage)
    let alive=true
    void api<Song>(`/admin/songs/${song.id}/`).then(full=>{
      if(!alive)return
      setDetail(full);setDraft(fromSong(full));setDirty(new Set())
    }).catch(err=>{if(alive)toast.show(errorMessageFa(err,'جزئیات کامل آهنگ دریافت نشد.'),'error')}).finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[song,initialPage,toast])

  const setField=<K extends keyof Draft>(key:K,value:Draft[K])=>{
    editVersion.current+=1
    setDraft(current=>({...current,[key]:value}))
    setDirty(current=>{const next=new Set(current);next.add(key);return next})
  }
  const score=metaScore(draft)
  const selectedGenreSet=new Set(draft.genres)
  const visibleSubGenres=(subGenres.data||[]).filter(item=>!item.parent_genre||selectedGenreSet.has(item.parent_genre)||draft.sub_genres.includes(item.id))
  const taxonomyLoading=genres.loading||subGenres.loading||moods.loading||tags.loading
  const taxonomyError=genres.error||subGenres.error||moods.error||tags.error

  async function save(){
    if(!detail||dirty.size===0){toast.show('تغییری برای ذخیره وجود ندارد.','info');return}
    const form=new FormData()
    const dirtyKeys=[...dirty]
    dirty.forEach(key=>{
      const value=draft[key]
      if(taxonomyDraftKeys.has(key)){
        const values=value as number[]
        if(values.length)values.forEach(id=>form.append(String(key),String(id)));else form.append(String(key),'')
      }else if(creditDraftKeys.has(key)){
        const values=splitLines(String(value))
        if(values.length)values.forEach(item=>form.append(String(key),item));else form.append(String(key),'')
      }else if(typeof value==='boolean') form.append(String(key),value?'true':'false')
      else form.append(String(key),String(value))
    })
    setSaving(true)
    try{
      const response=await api<Song>(`/admin/songs/${detail.id}/`,{method:'PATCH',body:form})
      const updated=applyDraftToSong(response,draft,dirtyKeys)
      setDetail(updated);setDraft(fromSong(updated));setDirty(new Set())
      toast.show('متادیتای آهنگ ذخیره شد.','success')
      void Promise.resolve(onSaved(updated)).catch(()=>undefined)
      onClose()
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setSaving(false)}
  }

  async function removeSong(){
    if(!detail||!removeMode)return
    setRemoving(true)
    try{
      await api(`/admin/songs/${detail.id}/?mode=${removeMode}`,{method:'DELETE'})
      toast.show(removeMode==='soft'?'آهنگ بدون حذف اطلاعات از دسترس مخاطبان خارج شد.':'آهنگ برای همیشه از پایگاه داده حذف شد.','success')
      const mode=removeMode
      setRemoveMode(null)
      await onRemoved?.(mode)
      onClose()
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setRemoving(false)}
  }

  const audioUrl=detail?.converted_audio_url||detail?.audio_file
  return <>
  <Modal open={open} title="مدیریت کامل متادیتای آهنگ" onClose={onClose} className="modal--song-meta">
    {detail&&<div className="song-meta-editor">
      <div className="song-meta-editor__summary">
        <span className="song-meta-editor__cover">{detail.cover_image?<img src={detail.cover_image} alt=""/>:<Music2 size={24}/>}</span>
        <div className="song-meta-editor__identity"><strong>{detail.title}</strong><span>{detail.artist_name}{detail.album_title?` · ${detail.album_title}`:''}</span><div><StatusBadge value={detail.status}/><span>{numberFa(detail.plays)} پخش</span><span>{numberFa(detail.likes_count||0)} پسند</span></div></div>
        <div className="song-meta-editor__score"><strong>{numberFa(score)}٪</strong><span>تکمیل متادیتای الگوریتم</span><i><b style={{width:`${score}%`}}/></i></div>
      </div>
      <nav className="song-meta-editor__tabs" aria-label="بخش‌های متادیتا">{pages.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} className={page===item.id?'is-active':''} onClick={()=>setPage(item.id)}><Icon size={15}/><span>{item.label}</span><b>{numberFa(item.id)}</b></button>})}</nav>
      <div className="song-meta-editor__page">
        {loading&&<div className="song-meta-editor__loading"><LoaderCircle className="spin" size={15}/>در حال دریافت آخرین اطلاعات…</div>}
        {page===1&&<div className="song-meta-page song-meta-page--classification">
          <div className="song-meta-page__intro"><div><strong>طبقه‌بندی برای پیشنهاد هوشمند</strong><span>ژانر و حال‌وهوا مستقیماً در درصد تکمیل الگوریتم اثر دارند. زیرژانر برای دقت بیشتر پیشنهادها نگهداری می‌شود.</span></div>{taxonomyLoading&&<LoaderCircle className="spin" size={16}/>}</div>
          {taxonomyError&&<div className="inline-note inline-note--danger">بخشی از گزینه‌های دسته‌بندی دریافت نشد؛ قبل از ذخیره اتصال را بررسی کنید.</div>}
          <div className="song-meta-taxonomy-grid">
            <TaxonomyPicker title="ژانر" items={genres.data||[]} selected={draft.genres} onChange={value=>setField('genres',value)}/>
            <TaxonomyPicker title="حال‌وهوا" items={moods.data||[]} selected={draft.moods} onChange={value=>setField('moods',value)}/>
            <TaxonomyPicker title="زیرژانر" items={visibleSubGenres} selected={draft.sub_genres} onChange={value=>setField('sub_genres',value)} emptyText={draft.genres.length?'برای ژانرهای انتخاب‌شده زیرژانری پیدا نشد.':'ابتدا ژانر را انتخاب کنید.'}/>
          </div>
        </div>}
        {page===2&&<div className="song-meta-page">
          <div className="song-meta-page__intro"><div><strong>ویژگی‌های شنیداری</strong><span>این مقادیر برای رتبه‌بندی و شباهت موسیقایی استفاده می‌شوند. مقدار خالی یعنی هنوز طبقه‌بندی نشده است.</span></div></div>
          <div className="song-audio-layout">
            <section className="song-tempo-card"><header><div><strong>تمپو / BPM</strong><span>سرعت قطعه</span></div><input type="number" min="0" max="300" value={draft.tempo} onChange={e=>setField('tempo',e.target.value)} placeholder="مثلاً ۱۲۸"/></header><input type="range" min="0" max="240" step="1" value={draft.tempo===''?0:Math.min(240,Number(draft.tempo)||0)} aria-label="تمپو / BPM" aria-valuetext={draft.tempo===''?'ثبت نشده':`${draft.tempo} BPM`} onChange={e=>setField('tempo',e.target.value)}/><button type="button" onClick={()=>setField('tempo','')}>پاک کردن مقدار</button></section>
            <div className="song-audio-controls">{audioFields.map(([key,label])=><AudioControl key={key} label={label} value={draft[key]} onChange={value=>setField(key,value)}/>)}</div>
            <label className="song-meta-toggle"><input type="checkbox" checked={draft.live_performed} onChange={e=>setField('live_performed',e.target.checked)}/><span><strong>اجرای زنده</strong><small>اگر نسخه ثبت‌شده اجرای زنده است فعال کنید.</small></span></label>
            {audioUrl&&<div className="song-meta-audio"><div><Music2 size={15}/><span>پیش‌شنوی فایل فعلی</span><small>{detail.original_format||''}{detail.duration_seconds?` · ${numberFa(detail.duration_seconds)} ثانیه`:''}</small></div><audio src={audioUrl} controls preload="none"/></div>}
          </div>
        </div>}
        {page===3&&<div className="song-meta-page song-meta-page--catalog">
          <div className="song-meta-page__intro"><div><strong>اطلاعات کاتالوگ و عوامل</strong><span>این بخش برای نمایش و اعتبار کاتالوگ است و روی درصد متادیتای الگوریتم اثر ندارد.</span></div></div>
          <section className="song-meta-section"><h3>اطلاعات پایه</h3><div className="song-meta-form-grid">
            <Field label="عنوان فارسی"><input value={draft.title} onChange={e=>setField('title',e.target.value)}/></Field><Field label="عنوان انگلیسی"><input dir="ltr" value={draft.title_en} onChange={e=>setField('title_en',e.target.value)}/></Field>
            <Field label="تاریخ انتشار"><input type="date" dir="ltr" value={draft.release_date} onChange={e=>setField('release_date',e.target.value)}/></Field><Field label="زبان"><input dir="ltr" value={draft.language} onChange={e=>setField('language',e.target.value)} placeholder="fa / en / ..."/></Field>
            <Field label="شماره دیسک"><input type="number" min="1" value={draft.album_disc_number} onChange={e=>setField('album_disc_number',e.target.value)}/></Field><Field label="شماره ترک"><input type="number" min="1" value={draft.album_track_number} onChange={e=>setField('album_track_number',e.target.value)}/></Field>
            <label className="song-meta-toggle song-meta-form-grid__full"><input type="checkbox" checked={draft.is_single} onChange={e=>setField('is_single',e.target.checked)}/><span><strong>تک‌آهنگ</strong><small>وضعیت تک‌آهنگ بودن این قطعه.</small></span></label>
          </div></section>
          <section className="song-meta-section"><h3>تگ‌های کاتالوگ</h3><TaxonomyPicker title="تگ" items={tags.data||[]} selected={draft.tags} onChange={value=>setField('tags',value)}/></section>
          <section className="song-meta-section"><h3>توضیحات و متن</h3><div className="song-meta-form-grid"><Field label="توضیحات فارسی"><textarea value={draft.description} onChange={e=>setField('description',e.target.value)}/></Field><Field label="توضیحات انگلیسی"><textarea dir="ltr" value={draft.description_en} onChange={e=>setField('description_en',e.target.value)}/></Field><Field label="متن ترانه فارسی"><textarea className="song-meta-textarea--tall" value={draft.lyrics} onChange={e=>setField('lyrics',e.target.value)}/></Field><Field label="متن ترانه انگلیسی"><textarea dir="ltr" className="song-meta-textarea--tall" value={draft.lyrics_en} onChange={e=>setField('lyrics_en',e.target.value)}/></Field></div></section>
          <section className="song-meta-section"><h3>ناشر و عوامل</h3><div className="song-meta-form-grid"><Field label="ناشر"><input value={draft.label} onChange={e=>setField('label',e.target.value)}/></Field><Field label="ناشر انگلیسی"><input dir="ltr" value={draft.label_en} onChange={e=>setField('label_en',e.target.value)}/></Field><Field label="تهیه‌کنندگان" hint="هر نام در یک خط"><textarea value={draft.producers} onChange={e=>setField('producers',e.target.value)}/></Field><Field label="تهیه‌کنندگان انگلیسی" hint="هر نام در یک خط"><textarea dir="ltr" value={draft.producers_en} onChange={e=>setField('producers_en',e.target.value)}/></Field><Field label="آهنگسازان" hint="هر نام در یک خط"><textarea value={draft.composers} onChange={e=>setField('composers',e.target.value)}/></Field><Field label="آهنگسازان انگلیسی" hint="هر نام در یک خط"><textarea dir="ltr" value={draft.composers_en} onChange={e=>setField('composers_en',e.target.value)}/></Field><Field label="ترانه‌سرایان" hint="هر نام در یک خط"><textarea value={draft.lyricists} onChange={e=>setField('lyricists',e.target.value)}/></Field><Field label="ترانه‌سرایان انگلیسی" hint="هر نام در یک خط"><textarea dir="ltr" value={draft.lyricists_en} onChange={e=>setField('lyricists_en',e.target.value)}/></Field><Field label="سایر عوامل / Credits"><textarea value={draft.credits} onChange={e=>setField('credits',e.target.value)}/></Field><Field label="Credits انگلیسی"><textarea dir="ltr" value={draft.credits_en} onChange={e=>setField('credits_en',e.target.value)}/></Field></div></section>
          <div className="song-meta-readonly"><span><b>هنرمند</b>{detail.artist_name}</span><span><b>آلبوم</b>{detail.album_title||'تک‌آهنگ / بدون آلبوم'}</span><span><b>فرمت فایل</b>{detail.original_format||'—'}</span><span><b>ثبت</b>{text(detail.created_at)}</span></div>
        </div>}
      </div>
      <footer className="song-meta-editor__footer">
        <div className="song-meta-editor__pager"><button type="button" className="button button--ghost button--compact" disabled={page===1} onClick={()=>setPage(current=>Math.max(1,current-1) as 1|2|3)}><ChevronRight size={15}/>قبلی</button><span>صفحه {numberFa(page)} از ۳</span><button type="button" className="button button--ghost button--compact" disabled={page===3} onClick={()=>setPage(current=>Math.min(3,current+1) as 1|2|3)}>بعدی<ChevronLeft size={15}/></button></div>
        <div className="song-meta-editor__save"><span>{dirty.size?`${numberFa(dirty.size)} تغییر ذخیره‌نشده`:'همه تغییرات ذخیره شده'}</span><div className="song-meta-editor__actions">{allowSoftDelete&&detail.status!=='deleted'&&<button type="button" className="button button--ghost button--warning button--compact" onClick={()=>setRemoveMode('soft')}><EyeOff size={15}/>حذف امن</button>}{allowHardDelete&&<button type="button" className="button button--danger button--compact" onClick={()=>setRemoveMode('hard')}><Trash2 size={15}/>حذف دائمی</button>}<button type="button" className="button button--primary" disabled={saving||dirty.size===0} onClick={()=>void save()}>{saving?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>}ذخیره تغییرات</button></div></div>
      </footer>
    </div>}
  </Modal>
  <Confirm open={Boolean(removeMode)} title={removeMode==='soft'?'حذف امن آهنگ':'حذف دائمی آهنگ'} text={removeMode==='soft'?'رکورد، آمار پخش، درآمد و متادیتا حفظ می‌شود؛ فقط آهنگ از دسترس مخاطبان خارج خواهد شد.':'این عملیات رکورد آهنگ را از پایگاه داده حذف می‌کند و برگشت‌پذیر نیست.'} confirmLabel={removeMode==='soft'?'خارج کردن از دسترس':'حذف دائمی'} danger={removeMode==='hard'} busy={removing} onClose={()=>setRemoveMode(null)} onConfirm={()=>void removeSong()}/>
  </>
}
