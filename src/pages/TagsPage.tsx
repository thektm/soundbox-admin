import { useMemo, useState } from 'react'
import { AlertTriangle, GitMerge, Layers3, ListTree, Pencil, Plus, Save, Smile, Tags, Trash2 } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, ErrorState, Field, Loading, Modal, PageHeader, SearchBox } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody } from '../lib/api'
import { numberFa } from '../lib/format'
import { useRemote } from '../lib/useRemote'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'

type TaxonomyKind = 'genre' | 'subgenre' | 'mood' | 'tag'
type TaxonomyUsage = { songs:number; albums:number; child_subgenres:number; direct_total:number }
type TaxonomyImpact = {
  songs:number
  albums:number
  child_subgenres:number
  cascade_songs:number
  cascade_albums:number
  affected_songs:number
  affected_albums:number
  release_workspaces:number
  release_workspaces_direct:number
  release_workspaces_cascade:number
  has_metadata_impact:boolean
}
type TaxonomyItem = {
  id:number
  kind:TaxonomyKind
  name:string
  name_en:string
  slug:string
  parent_genre?:{id:number;name:string;name_en:string}|null
  usage:TaxonomyUsage
  impact?:TaxonomyImpact
}
type TaxonomySummary = { count:number; song_links:number; album_links:number }
type TaxonomyPayload = {
  items:Record<TaxonomyKind,TaxonomyItem[]>
  summary:Record<TaxonomyKind,TaxonomySummary>
}
type EditorState = { mode:'create'|'edit'; item?:TaxonomyItem } | null
type DeleteState = { item:TaxonomyItem; detail:TaxonomyItem|null; loading:boolean } | null

type Draft = { name:string; name_en:string; parent_genre:string }

const EMPTY_DRAFT:Draft = { name:'', name_en:'', parent_genre:'' }
const KIND_META:Record<TaxonomyKind,{label:string;singular:string;description:string;icon:typeof Tags}> = {
  genre:{label:'ژانرها',singular:'ژانر',description:'دسته‌بندی اصلی سبک موسیقی',icon:Layers3},
  subgenre:{label:'زیرژانرها',singular:'زیرژانر',description:'شاخه‌های وابسته به هر ژانر',icon:ListTree},
  mood:{label:'حس‌وحال‌ها',singular:'حس‌وحال',description:'حال‌وهوای شنیداری قطعه',icon:Smile},
  tag:{label:'تگ‌ها',singular:'تگ',description:'برچسب‌های عمومی برای کشف محتوا',icon:Tags},
}

function hasImpact(item:TaxonomyItem|null|undefined) {
  const impact = item?.impact
  return Boolean(impact?.has_metadata_impact)
}

export default function TagsPage() {
  const {user}=useAuth(); const canEdit=can(user,'tags.edit'), canDelete=can(user,'tags.delete')
  const remote = useRemote<TaxonomyPayload>('/admin/taxonomy/')
  const toast = useToast()
  const [kind,setKind] = useState<TaxonomyKind>('genre')
  const [search,setSearch] = useState('')
  const [sort,setSort] = useState('name')
  const [editor,setEditor] = useState<EditorState>(null)
  const [draft,setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [deleteState,setDeleteState] = useState<DeleteState>(null)
  const [replacement,setReplacement] = useState('')
  const [confirmText,setConfirmText] = useState('')
  const [busy,setBusy] = useState(false)

  const allItems = remote.data?.items[kind] || []
  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('fa')
    const rows = q ? allItems.filter(item => [item.name,item.name_en,item.slug,item.parent_genre?.name,item.parent_genre?.name_en].some(value => String(value||'').toLocaleLowerCase('fa').includes(q))) : [...allItems]
    rows.sort((a,b) => {
      if (sort === 'usage') return (b.usage.songs+b.usage.albums+b.usage.child_subgenres)-(a.usage.songs+a.usage.albums+a.usage.child_subgenres) || a.name.localeCompare(b.name,'fa')
      if (sort === 'newest') return b.id-a.id
      return a.name.localeCompare(b.name,'fa')
    })
    return rows
  },[allItems,search,sort])

  const genres = remote.data?.items.genre || []
  const deleteItem = deleteState?.detail || deleteState?.item || null
  const impact = deleteItem?.impact
  const replacementOptions = (remote.data?.items[kind] || []).filter(item => item.id !== deleteItem?.id)
  const requiresTypedConfirm = hasImpact(deleteItem)
  const deleteReady = Boolean(deleteItem) && (!requiresTypedConfirm || confirmText.trim() === deleteItem?.name)

  function openCreate() {
    if (kind==='subgenre' && genres.length===0) {
      toast.show('برای ساخت زیرژانر ابتدا حداقل یک ژانر ایجاد کنید.','info')
      setKind('genre')
      return
    }
    setDraft({ ...EMPTY_DRAFT, parent_genre:kind==='subgenre' ? String(genres[0]?.id||'') : '' })
    setEditor({mode:'create'})
  }

  function openEdit(item:TaxonomyItem) {
    setDraft({name:item.name,name_en:item.name_en||'',parent_genre:String(item.parent_genre?.id||'')})
    setEditor({mode:'edit',item})
  }

  async function save() {
    if (!editor) return
    if (!draft.name.trim() || !draft.name_en.trim()) {
      toast.show('نام فارسی و انگلیسی هر دو الزامی هستند.','error')
      return
    }
    if (kind==='subgenre' && !draft.parent_genre) {
      toast.show('برای زیرژانر، ژانر مادر را انتخاب کنید.','error')
      return
    }
    setBusy(true)
    try {
      const body = {
        kind,
        name:draft.name.trim(),
        name_en:draft.name_en.trim(),
        ...(editor.mode==='edit' && editor.item ? {slug:editor.item.slug} : {}),
        ...(kind==='subgenre'?{parent_genre:Number(draft.parent_genre)}:{}),
      }
      if (editor.mode==='create') {
        await api<TaxonomyItem>('/admin/taxonomy/',{method:'POST',body:jsonBody(body)})
        toast.show(`${KIND_META[kind].singular} جدید ساخته شد.`,'success')
      } else if (editor.item) {
        await api<TaxonomyItem>(`/admin/taxonomy/${kind}/${editor.item.id}/`,{method:'PATCH',body:jsonBody(body)})
        toast.show(`${KIND_META[kind].singular} با موفقیت ویرایش شد.`,'success')
      }
      setEditor(null)
      await remote.reload()
    } catch (err) {
      toast.show(errorMessageFa(err),'error')
    } finally { setBusy(false) }
  }

  async function beginDelete(item:TaxonomyItem) {
    setReplacement('')
    setConfirmText('')
    setDeleteState({item,detail:null,loading:true})
    try {
      const detail = await api<TaxonomyItem>(`/admin/taxonomy/${kind}/${item.id}/`)
      setDeleteState({item,detail,loading:false})
    } catch (err) {
      setDeleteState(null)
      toast.show(errorMessageFa(err),'error')
    }
  }

  async function remove() {
    const item = deleteState?.detail || deleteState?.item
    if (!item || !deleteReady) return
    setBusy(true)
    try {
      await api(`/admin/taxonomy/${kind}/${item.id}/`,{
        method:'DELETE',
        body:jsonBody({
          replacement_id:replacement ? Number(replacement) : null,
          confirm_name:requiresTypedConfirm ? confirmText.trim() : '',
          allow_metadata_loss:!replacement && requiresTypedConfirm,
        }),
      })
      const replacementItem = replacementOptions.find(row => String(row.id)===replacement)
      toast.show(replacementItem ? `${item.name} در «${replacementItem.name}» ادغام و سپس حذف شد؛ اتصالات متادیتا حفظ شدند.` : `${item.name} حذف شد.`,'success')
      setDeleteState(null)
      setReplacement('')
      setConfirmText('')
      await remote.reload()
    } catch (err) {
      toast.show(errorMessageFa(err),'error')
    } finally { setBusy(false) }
  }

  const meta = KIND_META[kind]
  return <div className="page-stack taxonomy-page">
    <PageHeader title="مدیریت تگ‌ها و دسته‌بندی موسیقی" description="ژانر، زیرژانر، حس‌وحال و تگ‌های متادیتای کاتالوگ را از یک مرکز مدیریت کنید." actions={canEdit?<button className="button button--primary" onClick={openCreate}><Plus size={17}/>افزودن {meta.singular}</button>:undefined}/>

    {remote.loading&&!remote.data?<Loading label="در حال دریافت ساختار متادیتا…"/>:remote.error&&!remote.data?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:remote.data&&<>
      <div className="taxonomy-tabs" role="tablist" aria-label="نوع متادیتا">
        {(Object.keys(KIND_META) as TaxonomyKind[]).map(tabKind=>{const tab=KIND_META[tabKind];const Icon=tab.icon;const summary=remote.data?.summary[tabKind];return <button key={tabKind} type="button" role="tab" aria-selected={kind===tabKind} className={`taxonomy-tab ${kind===tabKind?'is-active':''}`} onClick={()=>{setKind(tabKind);setSearch('')}}><span className="taxonomy-tab__icon"><Icon size={18}/></span><span><strong>{tab.label}</strong><small>{tab.description}</small></span><b>{numberFa(summary?.count||0)}</b></button>})}
      </div>

      <div className="taxonomy-overview-grid">
        <Card className="taxonomy-overview"><span>تعداد {meta.label}</span><strong>{numberFa(remote.data.summary[kind].count)}</strong><small>رکورد فعال در ساختار متادیتا</small></Card>
        <Card className="taxonomy-overview"><span>اتصال به آهنگ‌ها</span><strong>{numberFa(remote.data.summary[kind].song_links)}</strong><small>مجموع استفاده در متادیتای ترک‌ها</small></Card>
        <Card className="taxonomy-overview"><span>اتصال به آلبوم‌ها</span><strong>{numberFa(remote.data.summary[kind].album_links)}</strong><small>{kind==='tag'?'تگ عمومی فقط مستقیماً روی آهنگ ذخیره می‌شود.':'مجموع استفاده در متادیتای آلبوم‌ها'}</small></Card>
      </div>

      <Card className="toolbar-card taxonomy-toolbar"><SearchBox value={search} onChange={setSearch} placeholder={`جستجو در ${meta.label}…`}/><div className="filters"><ProductSelect ariaLabel="مرتب‌سازی" value={sort} onValueChange={setSort} options={[{value:'name',label:'بر اساس نام'},{value:'usage',label:'بیشترین استفاده'},{value:'newest',label:'جدیدترین ثبت'}]}/>{canEdit&&<button className="button button--primary taxonomy-toolbar__add" onClick={openCreate}><Plus size={16}/>افزودن {meta.singular}</button>}</div></Card>

      <Card className="taxonomy-table-card"><DataTable<TaxonomyItem> rows={filteredItems} emptyTitle={`${meta.singular}ی پیدا نشد`} columns={[
        {key:'name',title:'عنوان',mobileWide:true,render:item=><div className="taxonomy-name-cell"><strong>{item.name}</strong><span dir="ltr">{item.name_en||'—'}</span></div>},
        ...(kind==='subgenre'?[{key:'parent',title:'ژانر مادر',render:(item:TaxonomyItem)=>item.parent_genre?<span className="taxonomy-parent-badge"><Layers3 size={13}/>{item.parent_genre.name}</span>:<span className="muted">بدون ژانر مادر</span>}]:[]),
        {key:'slug',title:'شناسه URL',render:item=><code className="taxonomy-slug" dir="ltr">{item.slug}</code>},
        {key:'usage',title:'استفاده',render:item=><div className="taxonomy-usage"><span title="آهنگ‌ها">{numberFa(item.usage.songs)} آهنگ</span>{kind!=='tag'&&<span title="آلبوم‌ها">{numberFa(item.usage.albums)} آلبوم</span>}{kind==='genre'&&<span title="زیرژانرها">{numberFa(item.usage.child_subgenres)} زیرژانر</span>}</div>},
        ...((canEdit||canDelete)?[{key:'actions',title:'عملیات',render:(item:TaxonomyItem)=><div className="row-actions">{canEdit&&<button className="icon-button" onClick={()=>openEdit(item)} title="ویرایش"><Pencil size={16}/></button>}{canDelete&&<button className="icon-button icon-button--danger" onClick={()=>void beginDelete(item)} title="حذف یا ادغام"><Trash2 size={16}/></button>}</div>}]:[]),
      ]}/></Card>
    </>}

    <Modal open={Boolean(editor)} title={`${editor?.mode==='create'?'افزودن':'ویرایش'} ${meta.singular}`} onClose={()=>!busy&&setEditor(null)}>
      {editor&&<div className="taxonomy-editor">
        <div className="taxonomy-editor__note"><span>فیلدهای اصلی</span><p>نام فارسی و انگلیسی برای حفظ نمایش صحیح در هر دو زبان الزامی‌اند.</p></div>
        <div className="form-grid">
          <Field label="نام فارسی"><input autoFocus value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder={`مثلاً ${kind==='genre'?'پاپ':kind==='subgenre'?'پاپ ایرانی':kind==='mood'?'آرام':'ریمیکس'}`}/></Field>
          <Field label="نام انگلیسی"><input dir="ltr" value={draft.name_en} onChange={e=>setDraft({...draft,name_en:e.target.value})} placeholder={`English ${meta.singular}`}/></Field>
          {kind==='subgenre'&&<Field label="ژانر مادر" hint="هر زیرژانر باید زیر یک ژانر اصلی باشد؛ تغییر ژانر مادر، ژانر مستقیم آهنگ‌های قدیمی را خودکار عوض نمی‌کند."><ProductSelect ariaLabel="انتخاب ژانر مادر" value={draft.parent_genre} onValueChange={value=>setDraft({...draft,parent_genre:value})} placeholder="ژانر مادر را انتخاب کنید" options={genres.map(genre=>({value:String(genre.id),label:`${genre.name} — ${genre.name_en}`}))}/></Field>}
        </div>
        <div className="dialog-actions"><button className="button button--ghost" disabled={busy} onClick={()=>setEditor(null)}>انصراف</button><button className="button button--primary" disabled={busy} onClick={()=>void save()}><Save size={16}/>{editor.mode==='create'?'ایجاد':'ذخیره تغییرات'}</button></div>
      </div>}
    </Modal>

    <Modal open={Boolean(deleteState)} title={`حذف یا ادغام ${meta.singular}`} onClose={()=>!busy&&setDeleteState(null)} wide>
      {deleteState?.loading?<Loading label="در حال محاسبه اثر حذف روی متادیتا…"/>:deleteItem&&impact&&<div className="taxonomy-delete">
        <div className={`taxonomy-risk ${impact.has_metadata_impact?'is-danger':'is-safe'}`}><span><AlertTriangle size={20}/></span><div><strong>{impact.has_metadata_impact?'این حذف روی متادیتای موجود اثر می‌گذارد.':'این مورد در متادیتای فعلی استفاده نشده است.'}</strong><p>{impact.has_metadata_impact?'اگر بدون جایگزین حذف کنید، اتصال این مورد از آهنگ‌ها/آلبوم‌ها و فضای انتشار پاک می‌شود. برای حفظ متادیتا، ادغام در یک مورد جایگزین پیشنهاد می‌شود.':'حذف این مورد اتصال فعالی از آهنگ یا آلبوم پاک نمی‌کند.'}</p></div></div>

        <div className="taxonomy-impact-grid">
          <div><span>آهنگ‌های متاثر</span><strong>{numberFa(impact.affected_songs)}</strong><small>{numberFa(impact.songs)} اتصال مستقیم</small></div>
          <div><span>آلبوم‌های متاثر</span><strong>{numberFa(impact.affected_albums)}</strong><small>{numberFa(impact.albums)} اتصال مستقیم</small></div>
          <div><span>فضای انتشار</span><strong>{numberFa(impact.release_workspaces)}</strong><small>پیش‌نویس / انتشار ذخیره‌شده</small></div>
          {kind==='genre'&&<div><span>زیرژانر وابسته</span><strong>{numberFa(impact.child_subgenres)}</strong><small>{replacement?'به ژانر جایگزین منتقل می‌شوند':'بدون جایگزین حذف آبشاری می‌شوند'}</small></div>}
        </div>

        {replacementOptions.length>0&&<div className="taxonomy-merge-box"><div className="taxonomy-merge-box__head"><span><GitMerge size={17}/></span><div><strong>حفظ متادیتا با ادغام</strong><p>اختیاری اما پیشنهادشده: تمام اتصال‌های «{deleteItem.name}» ابتدا به مورد انتخاب‌شده منتقل می‌شوند و سپس رکورد فعلی حذف می‌شود.{kind==='genre'?' زیرژانرهای آن نیز به ژانر جایگزین منتقل می‌شوند.':''}</p></div></div><ProductSelect ariaLabel="انتخاب جایگزین" value={replacement} onValueChange={setReplacement} placeholder="بدون جایگزین؛ حذف اتصال‌ها" options={[{value:'',label:'بدون جایگزین — حذف اتصال‌ها'},...replacementOptions.map(item=>({value:String(item.id),label:`${item.name} — ${item.name_en}${item.parent_genre?` · ${item.parent_genre.name}`:''}`}))]}/>{replacement&&<div className="taxonomy-preserve-note">متادیتای وابسته قبل از حذف به مورد جایگزین منتقل خواهد شد.</div>}</div>}

        {kind==='genre'&&impact.child_subgenres>0&&!replacement&&<div className="taxonomy-cascade-warning"><AlertTriangle size={17}/><div><strong>هشدار حذف آبشاری زیرژانرها</strong><p>به‌دلیل ساختار دیتابیس، حذف این ژانر بدون جایگزین باعث حذف دائمی {numberFa(impact.child_subgenres)} زیرژانر آن نیز می‌شود و اتصال آن زیرژانرها از {numberFa(impact.cascade_songs)} آهنگ و {numberFa(impact.cascade_albums)} آلبوم پاک خواهد شد.</p></div></div>}

        {requiresTypedConfirm&&<Field label={`برای تأیید، دقیقاً «${deleteItem.name}» را وارد کنید.`} hint={replacement?'این تأیید برای ادغام و حذف رکورد فعلی است.':'این تأیید یعنی حذف اتصال‌های متادیتا بدون جایگزین را پذیرفته‌اید.'}><input value={confirmText} onChange={e=>setConfirmText(e.target.value)} autoComplete="off"/></Field>}

        <div className="dialog-actions taxonomy-delete__actions"><button className="button button--ghost" disabled={busy} onClick={()=>setDeleteState(null)}>انصراف</button><button className="button button--danger" disabled={busy||!deleteReady} onClick={()=>void remove()}>{replacement?<GitMerge size={16}/>:<Trash2 size={16}/>} {replacement?'ادغام و حذف':'حذف دائمی'}</button></div>
      </div>}
    </Modal>
  </div>
}
