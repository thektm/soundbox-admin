import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, CircleDollarSign, Eye, ReceiptText, Save, WalletCards } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { Card, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa, moneyFa, numberFa, paymentMethodFa, preciseMoneyFa } from '../lib/format'
import type { DepositRequest, Paginated, PaymentTransaction } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type Period = {
  revenue:number; successful_payment_count:number; paid_to_artists:number; paid_to_artists_count:number
  pending_artist_payouts:number; pending_artist_payout_count:number
}
type FinanceSummary = { today:Period; last_7_days:Period; last_30_days:Period; all_time:Period; payment_status:Record<string,number>; payout_status:Record<string,number> }
type ArtistEarning = {
  artist_id:number; artist_name:string; artist_phone?:string|null; verified:boolean; stream_count:number
  earned_total:number; paid_total:number; pending_total:number; remaining_total:number
}
type FinanceTab = 'payments' | 'payouts' | 'earnings'

export default function FinancePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initialTab: FinanceTab = params.get('tab') === 'payouts' || params.get('tab') === 'earnings' ? params.get('tab') as FinanceTab : 'payments'
  const [tab, setTab] = useState<FinanceTab>(initialTab)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(() => params.get('status') || '')
  const [sort, setSort] = useState(initialTab === 'earnings' ? 'earned' : 'time')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction|null>(null)
  const [selectedPayout, setSelectedPayout] = useState<DepositRequest|null>(null)
  const selectedPayoutIdRef = useRef<number|null>(null)
  const [payoutStatus, setPayoutStatus] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [busy, setBusy] = useState(false)
  const q = useDebouncedValue(search)
  const toast = useToast()
  const summary = useRemote<FinanceSummary>('/admin/finance/')
  const payments = useRemote<Paginated<PaymentTransaction>>(
    tab === 'payments' ? '/admin/finance/transactions/' + queryString({ q, status, sort, direction, page, page_size:20 }) : null,
  )
  const payouts = useRemote<Paginated<DepositRequest>>(
    tab === 'payouts' ? '/admin/finance/deposits/' + queryString({ q, status, sort, direction, page, page_size:20 }) : null,
  )
  const earnings = useRemote<Paginated<ArtistEarning>>(
    tab === 'earnings' ? '/admin/finance/artist-earnings/' + queryString({ q, sort, direction, page, page_size:20 }) : null,
  )
  const current = tab === 'payments' ? payments : tab === 'payouts' ? payouts : earnings

  function switchTab(next: FinanceTab) {
    setTab(next); setSearch(''); setStatus(''); setPage(1); setDirection('desc'); setSort(next === 'earnings' ? 'earned' : 'time')
  }
  function openPayout(payout: DepositRequest) {
    selectedPayoutIdRef.current=payout.id
    setSelectedPayout(payout); setPayoutStatus(payout.status); setTransactionId(payout.transaction_id || '')
  }
  function closePayout(){selectedPayoutIdRef.current=null;setSelectedPayout(null)}
  const payoutVisible=(item:DepositRequest)=>!status||(status==='open'?item.status==='pending'||item.status==='approved':item.status===status)
  const setPayoutInPage=(current:Paginated<DepositRequest>|null,item:DepositRequest,indexHint:number)=>{
    if(!current)return current
    const existing=current.results.find(row=>row.id===item.id)
    const visible=payoutVisible(item)
    const next=setPaginatedItem(current,item,{visible,indexHint})
    if(!next||typeof current.total_amount!=='number')return next
    if(existing&&!visible)return {...next,total_amount:Math.max(0,current.total_amount-Number(existing.amount||0))}
    if(!existing&&visible)return {...next,total_amount:current.total_amount+Number(item.amount||0)}
    return next
  }
  async function savePayout() {
    if (!selectedPayout) return
    const target=selectedPayout; const snapshot=pageSnapshot(payouts.data,target.id)
    const requestedStatus=payoutStatus; const requestedTransaction=transactionId.trim()
    setBusy(true)
    try {
      const result = await api<DepositRequest>(`/admin/finance/deposits/${target.id}/`, { method:'PATCH', body:jsonBody({ status:requestedStatus, transaction_id:requestedTransaction }) })
      const optimistic={...target,...result,status:requestedStatus,transaction_id:requestedTransaction}
      payouts.setData(current=>setPayoutInPage(current,optimistic,snapshot.index))
      closePayout()
      toast.show('وضعیت تسویه به‌روزرسانی شد.', 'success')
      void verifyExactEntity<DepositRequest>(`/admin/finance/deposits/${target.id}/`,{
        found:server=>{
          payouts.setData(current=>setPayoutInPage(current,server,snapshot.index))
          if(selectedPayoutIdRef.current===server.id){setSelectedPayout(server);setPayoutStatus(current=>current===requestedStatus?server.status:current);setTransactionId(current=>current===requestedTransaction?(server.transaction_id||''):current)}
        },
        missing:()=>{
          payouts.setData(current=>removePaginatedItem(current,target.id))
          if(selectedPayoutIdRef.current===target.id)closePayout()
        },
      },{stopWhenFound:server=>server.status===requestedStatus&&String(server.transaction_id||'').trim()===requestedTransaction}).then(outcome=>{if(outcome!=='superseded'){void payouts.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order));void summary.revalidate()}})
      void summary.revalidate()
    } catch (err) { toast.show(errorMessageFa(err), 'error') } finally { setBusy(false) }
  }

  const all = summary.data?.all_time
  return <div className="page-stack">
    <PageHeader title="مالی و تسویه" description="پرداخت کاربران، تعهد مالی هنرمندان و چرخه کامل تسویه" />
    {all && <div className="finance-stats">
      <Card><CircleDollarSign size={20}/><span>کل درآمد پلتفرم</span><strong>{moneyFa(all.revenue)}</strong><small>{numberFa(all.successful_payment_count)} پرداخت موفق</small></Card>
      <Card><CheckCircle2 size={20}/><span>پرداخت‌شده به هنرمندان</span><strong>{moneyFa(all.paid_to_artists)}</strong><small>{numberFa(all.paid_to_artists_count)} تسویه تکمیل‌شده</small></Card>
      <Card><WalletCards size={20}/><span>در انتظار تسویه</span><strong>{moneyFa(all.pending_artist_payouts)}</strong><small>{numberFa(all.pending_artist_payout_count)} درخواست باز</small></Card>
    </div>}

    <div className="segmented">
      <button className={tab==='payments'?'is-active':''} onClick={()=>switchTab('payments')}>پرداخت کاربران</button>
      <button className={tab==='payouts'?'is-active':''} onClick={()=>switchTab('payouts')}>تسویه هنرمندان</button>
      <button className={tab==='earnings'?'is-active':''} onClick={()=>switchTab('earnings')}>درآمد هنرمندان</button>
    </div>

    <Card className="toolbar-card">
      <SearchBox value={search} onChange={value=>{setSearch(value);setPage(1)}} placeholder={tab==='payments'?'شماره تراکنش یا شماره همراه':tab==='payouts'?'نام هنرمند یا شماره تراکنش':'نام هنرمند یا شماره همراه'} />
      <div className="filters">
        {tab !== 'earnings' && <ProductSelect ariaLabel="فیلتر وضعیت مالی" value={status} onValueChange={value=>{setStatus(value);setPage(1)}} options={tab==='payments' ? [{value:'',label:'همه وضعیت‌ها'},{value:'success',label:'موفق'},{value:'pending',label:'در انتظار'},{value:'failed',label:'ناموفق'}] : [{value:'',label:'همه وضعیت‌ها'},{value:'open',label:'در انتظار تسویه'},{value:'pending',label:'در انتظار'},{value:'approved',label:'تأیید شده'},{value:'done',label:'انجام شده'},{value:'rejected',label:'رد شده'}]}/>} 
        <ProductSelect ariaLabel="مرتب‌سازی مالی" value={`${sort}:${direction}`} onValueChange={value=>{const[s,d]=value.split(':');setSort(s);setDirection(d);setPage(1)}} options={tab==='earnings' ? [{value:'earned:desc',label:'بیشترین درآمد'},{value:'earned:asc',label:'کمترین درآمد'},{value:'streams:desc',label:'بیشترین استریم'},{value:'streams:asc',label:'کمترین استریم'}] : [{value:'time:desc',label:'جدیدترین'},{value:'time:asc',label:'قدیمی‌ترین'},{value:'amount:desc',label:'بیشترین مبلغ'},{value:'amount:asc',label:'کمترین مبلغ'}]}/>
      </div>
    </Card>

    <Card>{current.error ? <ErrorState message={current.error} retry={()=>void current.reload()} /> : tab === 'payments' ? <>
      <DataTable<PaymentTransaction> loading={payments.loading} rows={payments.data?.results || []} columns={[
        {key:'id',title:'شناسه تراکنش',render:x=><code className="mono">{x.transaction_id}</code>},
        {key:'user',title:'کاربر',render:x=><span dir="ltr">{x.user_phone}</span>},
        {key:'amount',title:'مبلغ',render:x=><strong>{moneyFa(x.amount)}</strong>},
        {key:'status',title:'وضعیت',render:x=><StatusBadge value={x.status}/>},
        {key:'time',title:'زمان',render:x=>dateTimeFa(x.created_at)},
        {key:'action',title:'جزئیات',render:x=><button className="icon-button" onClick={()=>setSelectedPayment(x)} title="جزئیات"><Eye size={17}/></button>},
      ]}/>
      {payments.data && <><div className="table-summary"><span>جمع نتایج فیلترشده</span><strong>{moneyFa(payments.data.total_amount)}</strong></div><Pagination count={payments.data.count} page={page} pageSize={20} onPage={setPage}/></>}
    </> : tab === 'payouts' ? <>
      <DataTable<DepositRequest> loading={payouts.loading} rows={payouts.data?.results || []} columns={[
        {key:'artist',title:'هنرمند',render:x=><div><strong>{x.artist_name}</strong><div className="subline" dir="ltr">{x.artist_phone||'—'}</div></div>},
        {key:'amount',title:'مبلغ',render:x=><strong>{moneyFa(x.amount)}</strong>},
        {key:'status',title:'وضعیت',render:x=><StatusBadge value={x.status}/>},
        {key:'time',title:'ثبت درخواست',render:x=>dateTimeFa(x.submission_date)},
        {key:'action',title:'مدیریت',render:x=><button className="button button--compact" onClick={()=>openPayout(x)}><Eye size={16}/>بررسی</button>},
      ]}/>
      {payouts.data && <><div className="table-summary"><span>جمع درخواست‌های فیلترشده</span><strong>{moneyFa(payouts.data.total_amount)}</strong></div><Pagination count={payouts.data.count} page={page} pageSize={20} onPage={setPage}/></>}
    </> : <>
      <DataTable<ArtistEarning> loading={earnings.loading} rows={earnings.data?.results || []} columns={[
        {key:'artist',title:'هنرمند',render:x=><div><strong>{x.artist_name}</strong><div className="subline" dir="ltr">{x.artist_phone||'—'}</div></div>},
        {key:'verify',title:'وضعیت',render:x=><span className={`status ${x.verified?'status--success':'status--neutral'}`}>{x.verified?'تأیید شده':'تأیید نشده'}</span>},
        {key:'streams',title:'استریم',render:x=><strong>{numberFa(x.stream_count)}</strong>},
        {key:'earned',title:'درآمد ثبت‌شده',render:x=><strong>{preciseMoneyFa(x.earned_total)}</strong>},
        {key:'paid',title:'تسویه‌شده',render:x=>preciseMoneyFa(x.paid_total)},
        {key:'pending',title:'در صف تسویه',render:x=>preciseMoneyFa(x.pending_total)},
        {key:'remaining',title:'مانده قابل رهگیری',render:x=><strong>{preciseMoneyFa(x.remaining_total)}</strong>},
        {key:'action',title:'عملیات',render:x=><button className="button button--compact" onClick={()=>navigate(`/artists?q=${encodeURIComponent(x.artist_phone || x.artist_name)}`)}><Eye size={16}/>هنرمند</button>},
      ]}/>
      {earnings.data && <><div className="table-summary"><span>کل درآمد ثبت‌شده نتایج</span><strong>{preciseMoneyFa(earnings.data.total_amount)}</strong></div><Pagination count={earnings.data.count} page={page} pageSize={20} onPage={setPage}/></>}
    </>}</Card>

    <Modal open={Boolean(selectedPayment)} title="جزئیات پرداخت کاربر" onClose={()=>setSelectedPayment(null)}>{selectedPayment && <div className="receipt">
      <div className="receipt__icon"><ReceiptText size={24}/></div><div><span>شناسه تراکنش</span><strong className="mono">{selectedPayment.transaction_id}</strong></div><div><span>شماره همراه</span><strong dir="ltr">{selectedPayment.user_phone}</strong></div><div><span>مبلغ</span><strong>{moneyFa(selectedPayment.amount)}</strong></div><div><span>روش پرداخت</span><strong>{paymentMethodFa(selectedPayment.payment_method)}</strong></div><div><span>وضعیت</span><StatusBadge value={selectedPayment.status}/></div><div><span>زمان ثبت</span><strong>{dateTimeFa(selectedPayment.created_at)}</strong></div>
    </div>}</Modal>

    <Modal open={Boolean(selectedPayout)} title="مدیریت تسویه هنرمند" onClose={closePayout}>{selectedPayout && <div className="form-grid">
      <div className="payout-amount form-grid__full"><span>مبلغ درخواست</span><strong>{moneyFa(selectedPayout.amount)}</strong><small>{selectedPayout.artist_name}</small></div>
      <Field label="وضعیت تسویه"><ProductSelect ariaLabel="وضعیت تسویه هنرمند" value={payoutStatus} onValueChange={setPayoutStatus} options={[{value:'pending',label:'در انتظار'},{value:'approved',label:'تأیید شده'},{value:'rejected',label:'رد شده'},{value:'done',label:'انجام شده'}]}/></Field>
      <Field label="شماره تراکنش" hint={payoutStatus==='done'?'برای ثبت وضعیت انجام‌شده الزامی است.':'در زمان پرداخت نهایی ثبت کنید.'}><input dir="ltr" value={transactionId} onChange={e=>setTransactionId(e.target.value)}/></Field>
      <div className="dialog-actions form-grid__full"><button className="button button--ghost" onClick={()=>setSelectedPayout(null)}>بستن</button><button className="button button--primary" disabled={busy} onClick={()=>void savePayout()}><Save size={17}/>ذخیره وضعیت</button></div>
    </div>}</Modal>
  </div>
}
