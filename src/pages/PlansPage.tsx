import { useRef, useState } from 'react'
import { BadgeCheck, Headphones, Save, Sparkles } from 'lucide-react'
import { Card, ErrorState, Field, Loading, PageHeader } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody } from '../lib/api'
import { moneyFa, numberFa, preciseMoneyFa } from '../lib/format'
import { useRemote } from '../lib/useRemote'
import { verifyExactEntity } from '../lib/mutationSync'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'

type Config = { premium_plan_price:number|string; per_normal_play_pay:number|string; per_premium_play_pay:number|string; minimum_payout_amount:number|string; ad_frequency:number; updated_at:string }
const configMatches = (server:Config, expected:Config) => Number(server.premium_plan_price)===Number(expected.premium_plan_price) && Number(server.per_normal_play_pay)===Number(expected.per_normal_play_pay) && Number(server.per_premium_play_pay)===Number(expected.per_premium_play_pay) && Number(server.minimum_payout_amount)===Number(expected.minimum_payout_amount) && Number(server.ad_frequency)===Number(expected.ad_frequency)

export default function PlansPage() {
  const {user}=useAuth();const canPrice=can(user,'plans.price'),canPayout=can(user,'plans.payout'),canAds=can(user,'plans.ads');const canSave=canPrice||canPayout||canAds
  const remote = useRemote<Config>('/admin/pap-settings/')
  const [draftOverride, setDraftOverride] = useState<Config|null>(null)
  const [busy, setBusy] = useState(false)
  const editVersion = useRef(0)
  const toast = useToast()
  const draft = draftOverride ?? remote.data

  const change = <K extends keyof Config>(key:K, value:Config[K]) => {
    editVersion.current += 1
    setDraftOverride(current => {
      const base = current ?? remote.data
      return base ? { ...base, [key]: value } : current
    })
  }

  async function save() {
    if (!draft) return
    const requested = { ...draft }
    const version = editVersion.current
    setBusy(true)
    try {
      const payload:Partial<Config>={}
      if(canPrice)payload.premium_plan_price=requested.premium_plan_price
      if(canPayout){payload.per_normal_play_pay=requested.per_normal_play_pay;payload.per_premium_play_pay=requested.per_premium_play_pay;payload.minimum_payout_amount=requested.minimum_payout_amount}
      if(canAds)payload.ad_frequency=requested.ad_frequency
      if(!Object.keys(payload).length)return
      const result = await api<Config>('/admin/pap-settings/', { method:'POST', body:jsonBody(payload) })
      const optimistic = { ...requested, ...result }
      setDraftOverride(optimistic)
      toast.show('قیمت‌گذاری و تنظیمات مالی ذخیره شد.', 'success')
      void verifyExactEntity<Config>('/admin/pap-settings/', {
        found: server => { if (editVersion.current === version) setDraftOverride(server) },
        missing: () => undefined,
      }, { stopWhenFound: server => configMatches(server, requested) })
    } catch (err) {
      toast.show(errorMessageFa(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page-stack"><PageHeader title="پلن و قیمت‌گذاری" description="صداباکس فقط دو پلن رایگان و پریمیوم دارد و پلن سومی در سیستم تعریف نشده است."/>{remote.loading&&!draft?<Loading/>:remote.error&&!draft?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:draft&&<><div className="plan-grid"><Card className="plan-card"><div className="plan-icon"><Headphones size={22}/></div><span>پلن رایگان</span><h2>رایگان</h2><p>دسترسی پایه مخاطب با محدودیت‌های تعریف‌شده در اپلیکیشن.</p><div className="plan-price">بدون هزینه</div></Card><Card className="plan-card plan-card--premium"><div className="plan-icon"><Sparkles size={22}/></div><span>پلن پریمیوم</span><h2>۳۰ روزه</h2><p>فعال‌سازی فعلاً از مسیر شبیه‌سازی‌شده انجام می‌شود تا درگاه زرین‌پال متصل شود.</p><div className="plan-price">{moneyFa(draft.premium_plan_price)}</div><div className="status status--success"><BadgeCheck size={14}/>فعال در سیستم</div></Card></div><Card><div className="section-title"><div><h2>تنظیمات قیمت و پرداخت</h2><p>مقادیر مرجع برای اشتراک، ارزش پخش و حداقل برداشت هنرمند</p></div></div><div className="form-grid"><Field label="قیمت پریمیوم ۳۰ روزه">{canPrice?<input type="number" min="0" value={draft.premium_plan_price} onChange={e=>change('premium_plan_price',e.target.value)}/>:<div className="settings-readonly-value">{moneyFa(draft.premium_plan_price)}</div>}</Field><Field label="ارزش هر پخش کاربر رایگان">{canPayout?<input type="number" min="0" step="0.00000001" value={draft.per_normal_play_pay} onChange={e=>change('per_normal_play_pay',e.target.value)}/>:<div className="settings-readonly-value">{preciseMoneyFa(draft.per_normal_play_pay)}</div>}</Field><Field label="ارزش هر پخش کاربر پریمیوم">{canPayout?<input type="number" min="0" step="0.00000001" value={draft.per_premium_play_pay} onChange={e=>change('per_premium_play_pay',e.target.value)}/>:<div className="settings-readonly-value">{preciseMoneyFa(draft.per_premium_play_pay)}</div>}</Field><Field label="حداقل مبلغ درخواست تسویه">{canPayout?<input type="number" min="0" value={draft.minimum_payout_amount} onChange={e=>change('minimum_payout_amount',e.target.value)}/>:<div className="settings-readonly-value">{moneyFa(draft.minimum_payout_amount)}</div>}</Field><Field label="فاصله تبلیغ صوتی بر اساس تعداد پخش">{canAds?<input type="number" min="1" value={draft.ad_frequency} onChange={e=>change('ad_frequency',Number(e.target.value))}/>:<div className="settings-readonly-value">هر {numberFa(draft.ad_frequency)} پخش</div>}</Field>{canSave&&<div className="dialog-actions form-grid__full"><button className="button button--primary" onClick={()=>void save()} disabled={busy}><Save size={17}/>ذخیره تنظیمات</button></div>}</div></Card></>}</div>
}
