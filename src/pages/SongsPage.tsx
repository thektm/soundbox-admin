import { useState } from 'react'
import { Eye, EyeOff, Heart, Pencil, Play, Trash2 } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { SongMetadataModal } from '../components/SongMetadataModal'
import { MarqueeText } from '../components/MarqueeText'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, queryString } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa, numberFa } from '../lib/format'
import type { Paginated, Song } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

const featureLabels: Array<[keyof Song, string]> = [
  ['tempo','تمپو'], ['energy','انرژی'], ['danceability','رقص‌پذیری'], ['valence','حس مثبت'],
  ['acousticness','آکوستیک'], ['instrumentalness','بی‌کلام'], ['speechiness','گفتاری'],
]
const songMutationFields=['title','title_en','description','description_en','lyrics','lyrics_en','release_date','language','is_single','album_disc_number','album_track_number','genres','sub_genres','moods','tags','tempo','energy','danceability','valence','acousticness','instrumentalness','speechiness','live_performed','label','label_en','producers','producers_en','composers','composers_en','lyricists','lyricists_en','credits','credits_en'] as const

function Tags({ values }: { values?: string[] }) {
  return values?.length ? <div className="tag-row">{values.map(value => <span key={value}>{value}</span>)}</div> : <span className="muted">ثبت نشده</span>
}

function MetaMeter({ value = 0, onClick }: { value?: number; onClick:()=>void }) {
  const safe=Math.max(0,Math.min(100,value))
  return <button type="button" className="meta-meter meta-meter--action" onClick={onClick} title="تکمیل و ویرایش متادیتای الگوریتم" aria-label={`ویرایش متادیتای الگوریتم؛ ${value} درصد تکمیل شده`}>
    <div><span>تکمیل متادیتا</span><strong>{numberFa(value)}٪</strong></div>
    <div className="meta-meter__bar" aria-hidden="true"><i style={{ width:`${safe}%` }} /></div>
  </button>
}

export default function SongsPage(){
  const {user}=useAuth();const canEdit=can(user,'songs.edit'),canTakedown=can(user,'songs.takedown'),canDelete=can(user,'songs.delete')
  const [search,setSearch]=useState(''); const [status,setStatus]=useState('all'); const [sort,setSort]=useState('time'); const [direction,setDirection]=useState('desc'); const [page,setPage]=useState(1)
  const [selected,setSelected]=useState<Song|null>(null); const [detailLoading,setDetailLoading]=useState(false); const [edit,setEdit]=useState<{song:Song;page:1|2|3}|null>(null)
  const [remove,setRemove]=useState<{song:Song;mode:'soft'|'hard'}|null>(null); const [removing,setRemoving]=useState(false)
  const q=useDebouncedValue(search); const toast=useToast(); const path='/admin/songs/'+queryString({q,status,sort,direction,page,page_size:20}); const remote=useRemote<Paginated<Song>>(path)
  const visibleInCurrentList=(song:Song)=>status==='all'||song.status===status
  const verifySong=async(song:Song,snapshot=pageSnapshot(remote.data,song.id),refreshPage=false,expect?:'soft-delete'|'hard-delete'|'saved'):Promise<Song|null|undefined>=>{
    let exact:Song|null|undefined
    const outcome=await verifyExactEntity<Song>(`/admin/songs/${song.id}/`,{
      found:server=>{
        exact=server
        remote.setData(current=>setPaginatedItem(current,server,{visible:visibleInCurrentList(server),indexHint:snapshot.index}))
        setSelected(current=>current?.id===server.id?server:current)
        setEdit(current=>current?.song.id===server.id?{...current,song:server}:current)
      },
      missing:()=>{
        exact=null
        remote.setData(current=>removePaginatedItem(current,song.id))
        setSelected(current=>current?.id===song.id?null:current)
        setEdit(current=>current?.song.id===song.id?null:current)
      },
    },expect==='hard-delete'?{stopOnMissing:true}:expect==='soft-delete'?{stopWhenFound:server=>server.status==='deleted'}:expect==='saved'?{stopWhenFound:server=>mutationFieldsMatch(server,song,songMutationFields)}:{})
    if(refreshPage&&outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))
    return exact
  }
  const applyRemoveSuccess=(song:Song,mode:'soft'|'hard')=>{
    const snapshot=pageSnapshot(remote.data,song.id)
    if(mode==='hard') remote.setData(current=>removePaginatedItem(current,song.id))
    else {
      const local={...song,status:'deleted'}
      remote.setData(current=>setPaginatedItem(current,local,{visible:visibleInCurrentList(local),indexHint:snapshot.index}))
    }
    if(selected?.id===song.id)setSelected(null)
    if(edit?.song.id===song.id)setEdit(null)
    void verifySong(song,snapshot,true,mode==='hard'?'hard-delete':'soft-delete')
  }
  async function detail(song:Song){setSelected(song);setDetailLoading(true);try{setSelected(await api<Song>(`/admin/songs/${song.id}/`))}catch(err){toast.show(errorMessageFa(err),'error')}finally{setDetailLoading(false)}}
  async function removeSong(){
    if(!remove)return
    const target=remove
    setRemoving(true)
    try{
      await api(`/admin/songs/${target.song.id}/?mode=${target.mode}`,{method:'DELETE'})
      toast.show(target.mode==='soft'?'آهنگ بدون حذف اطلاعات از دسترس مخاطبان خارج شد.':'آهنگ برای همیشه از پایگاه داده حذف شد.','success')
      setRemove(null)
      applyRemoveSuccess(target.song,target.mode)
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setRemoving(false)}
  }
  function openMeta(song:Song){setEdit({song,page:1})}
  function openEdit(song:Song){setEdit({song,page:3})}
  return <div className="page-stack"><PageHeader title="مدیریت آهنگ‌ها" description="مشاهده وضعیت، آمار پخش و متادیتای مؤثر بر الگوریتم پیشنهاد"/>
    <Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="نام آهنگ یا هنرمند"/><div className="filters"><ProductSelect ariaLabel="فیلتر وضعیت آهنگ‌ها" value={status} onValueChange={value=>{setStatus(value);setPage(1)}} options={[{value:'all',label:'همه وضعیت‌ها'},{value:'published',label:'منتشر شده'},{value:'pending',label:'در انتظار'},{value:'approved',label:'تأیید شده'},{value:'rejected',label:'رد شده'},{value:'deleted',label:'از دسترس خارج'}]}/><ProductSelect ariaLabel="مرتب‌سازی آهنگ‌ها" value={`${sort}:${direction}`} onValueChange={value=>{const[s,d]=value.split(':');setSort(s);setDirection(d);setPage(1)}} options={[{value:'time:desc',label:'جدیدترین'},{value:'plays:desc',label:'بیشترین پخش'},{value:'plays:asc',label:'کمترین پخش'},{value:'likes:desc',label:'بیشترین پسند'},{value:'likes:asc',label:'کمترین پسند'},{value:'meta:desc',label:'متادیتای کامل‌تر'},{value:'meta:asc',label:'متادیتای ناقص‌تر'},{value:'release:desc',label:'تاریخ انتشار'}]}/></div></Card>
    <Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<Song> loading={remote.loading} rows={remote.data?.results||[]} columns={[
      {key:'song',title:'آهنگ',render:s=><div className="media-cell"><span className="media-cover">{s.cover_image?<img src={s.cover_image} alt="" loading="lazy"/>:<Play size={18}/>}</span><div><MarqueeText as="strong" text={s.title}/><MarqueeText text={s.artist_name}/></div></div>},
      {key:'status',title:'وضعیت',render:s=><StatusBadge value={s.status}/>},{key:'plays',title:'پخش',render:s=>numberFa(s.plays)},{key:'likes',title:'پسند',render:s=><span className="inline-icon"><Heart size={14}/>{numberFa(s.likes_count||0)}</span>},
      {key:'meta',title:'متادیتای الگوریتم',render:s=>canEdit?<MetaMeter value={s.metadata_completion||0} onClick={()=>openMeta(s)}/>:<span>{numberFa(s.metadata_completion||0)}٪</span>},{key:'created',title:'ثبت',render:s=>dateTimeFa(s.created_at)},
      {key:'actions',title:'عملیات',render:s=><div className="row-actions"><button className="icon-button" title="جزئیات" onClick={()=>void detail(s)}><Eye size={17}/></button>{canEdit&&<button className="icon-button" title="ویرایش" onClick={()=>openEdit(s)}><Pencil size={17}/></button>}{canTakedown&&s.status!=='deleted'&&<button className="icon-button icon-button--warning" title="حذف امن؛ فقط خارج از دسترس" onClick={()=>setRemove({song:s,mode:'soft'})}><EyeOff size={17}/></button>}{canDelete&&<button className="icon-button icon-button--danger" title="حذف دائمی از دیتابیس" onClick={()=>setRemove({song:s,mode:'hard'})}><Trash2 size={17}/></button>}</div>},
    ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card>
    <Modal open={Boolean(selected)} title="جزئیات آهنگ" onClose={()=>setSelected(null)} wide>{selected&&<div className="song-detail"><div className="song-detail__head"><span className="media-cover media-cover--xl">{selected.cover_image?<img src={selected.cover_image} alt=""/>:<Play size={26}/>}</span><div className="song-detail__identity"><MarqueeText as="strong" className="song-detail__title" text={selected.title}/><MarqueeText className="song-detail__artist" text={selected.artist_name}/><StatusBadge value={selected.status}/></div></div>{detailLoading&&<div className="inline-note">در حال تکمیل جزئیات…</div>}<div className="identity-grid"><div><span>تعداد پخش</span><strong>{numberFa(selected.plays)}</strong></div><div><span>تعداد پسند</span><strong>{numberFa(selected.likes_count||0)}</strong></div><div><span>آلبوم</span><strong>{selected.album_title||'تک‌آهنگ'}</strong></div><div><span>تاریخ انتشار</span><strong>{selected.release_date||'—'}</strong></div><div><span>مدت</span><strong>{selected.duration_seconds?`${numberFa(selected.duration_seconds)} ثانیه`:'—'}</strong></div><div><span>تکمیل متادیتای الگوریتم</span><strong>{numberFa(selected.metadata_completion||0)}٪</strong></div></div><div className="classification-grid"><div><span>ژانر</span><Tags values={selected.genre_names}/></div><div><span>زیرژانر</span><Tags values={selected.sub_genre_names}/></div><div><span>مود</span><Tags values={selected.mood_names}/></div></div><div className="audio-feature-grid">{featureLabels.map(([key,label])=><div key={String(key)}><span>{label}</span><strong>{selected[key] == null ? '—' : numberFa(Number(selected[key]))}</strong></div>)}</div>{selected.audio_file&&<audio className="audio-preview" src={selected.converted_audio_url||selected.audio_file} controls preload="none"/>}{(canTakedown&&selected.status!=='deleted'||canDelete)&&<div className="dialog-actions song-detail__actions">{canTakedown&&selected.status!=='deleted'&&<button className="button button--ghost button--warning" onClick={()=>setRemove({song:selected,mode:'soft'})}><EyeOff size={16}/>حذف امن</button>}{canDelete&&<button className="button button--danger" onClick={()=>setRemove({song:selected,mode:'hard'})}><Trash2 size={16}/>حذف دائمی</button>}</div>}</div>}</Modal>
    <Confirm open={Boolean(remove)} title={remove?.mode==='soft'?'حذف امن آهنگ':'حذف دائمی آهنگ'} text={remove?.mode==='soft'?'رکورد، آمار پخش، درآمد و ارتباطات آهنگ حفظ می‌شود؛ فقط آهنگ از دسترس مخاطبان خارج خواهد شد.':'این عملیات رکورد آهنگ را از پایگاه داده حذف می‌کند و برگشت‌پذیر نیست. ارتباط آن با انتشارها نیز به‌صورت امن پاک‌سازی می‌شود.'} confirmLabel={remove?.mode==='soft'?'خارج کردن از دسترس':'حذف دائمی'} danger={remove?.mode==='hard'} busy={removing} onClose={()=>setRemove(null)} onConfirm={()=>void removeSong()}/>
    {edit&&<SongMetadataModal song={edit.song} initialPage={edit.page} allowSoftDelete={canTakedown} allowHardDelete={canDelete} onClose={()=>setEdit(null)} onSaved={async updated=>{const snapshot=pageSnapshot(remote.data,updated.id);remote.setData(current=>setPaginatedItem(current,updated,{visible:visibleInCurrentList(updated),indexHint:snapshot.index}));return await verifySong(updated,snapshot,true,'saved')}} onRemoved={mode=>{const song=edit.song;setEdit(null);applyRemoveSuccess(song,mode)}}/>}
  </div>
}
