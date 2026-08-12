import { BadgeDollarSign, ChevronLeft, Cloud, Headphones, Server, ShieldCheck, TrendingUp, UserCheck, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, ErrorState, Loading, PageHeader, StatusBadge } from '../components/Ui'
import { DataTable } from '../components/DataTable'
import { dateTimeFa, moneyFa, numberFa } from '../lib/format'
import type { DashboardSummary, DepositRequest, PaymentTransaction, SystemStatus } from '../lib/types'
import { useRemote } from '../lib/useRemote'

function Stat({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: string; note: string }) {
  return <Card className="stat-card"><div className="stat-card__icon"><Icon size={21} /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></Card>
}

function MetricLink({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return <button className="metric-link" onClick={onClick}><span>{label}</span><span className="metric-link__value"><strong>{value}</strong><ChevronLeft size={16} /></span></button>
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const summary = useRemote<DashboardSummary>('/admin/home-summary/')
  const system = useRemote<SystemStatus>('/admin/system-status/')
  if (summary.loading && !summary.data) return <><PageHeader title="داشبورد" description="نمای کلی وضعیت پلتفرم" /><Loading /></>
  if (summary.error && !summary.data) return <><PageHeader title="داشبورد" /><ErrorState message={summary.error} retry={() => void summary.reload()} /></>
  const data = summary.data
  if (!data) return null
  return <div className="page-stack">
    <PageHeader title="داشبورد" description="وضعیت کاربران، هنرمندان، استریم و جریان مالی صداباکس" actions={<button className="button button--ghost" onClick={() => { void summary.reload(); void system.reload() }}>به‌روزرسانی</button>} />
    <div className="status-strip">
      <div><strong>وضعیت سرویس‌ها</strong><span>آخرین بررسی: {system.data ? dateTimeFa(system.data.checked_at) : 'در حال بررسی…'}</span></div>
      <div className="service-chips">
        <span className={`service-chip ${system.data?.api.ok ? 'is-ok' : 'is-wait'}`}><Server size={16} /> سرور اصلی {system.data?.api.ok ? 'فعال' : 'در حال بررسی'}</span>
        <span className={`service-chip ${system.data?.r2.ok ? 'is-ok' : system.loading ? 'is-wait' : 'is-bad'}`} title={system.data?.r2.detail}><Cloud size={16} /> فضای ذخیره‌سازی {system.data?.r2.ok ? 'فعال' : system.loading ? 'در حال بررسی' : 'در دسترس نیست'}</span>
      </div>
    </div>
    <div className="stats-grid">
      <Stat icon={Users} label="کاربران" value={numberFa(data.users.total)} note={`${numberFa(data.users.new_30_days)} عضو جدید در ۳۰ روز`} />
      <Stat icon={UserCheck} label="هنرمندان" value={numberFa(data.artists.total)} note={`${numberFa(data.artists.pending_verification)} درخواست در صف تأیید`} />
      <Stat icon={Headphones} label="کل استریم" value={numberFa(data.streams.total)} note={`${numberFa(data.streams.last_24_hours)} استریم در ۲۴ ساعت`} />
      <Stat icon={BadgeDollarSign} label="درآمد پلتفرم" value={moneyFa(data.money.platform_revenue)} note={`${moneyFa(data.money.revenue_30_days)} در ۳۰ روز`} />
      <Stat icon={WalletCards} label="پرداخت‌شده به هنرمندان" value={moneyFa(data.money.artist_paid_total)} note={`${numberFa(data.money.artist_pending_payout_count)} تسویه باز`} />
      <Stat icon={TrendingUp} label="مانده ناخالص" value={moneyFa(data.money.gross_after_paid_payouts)} note="درآمد منهای تسویه‌های انجام‌شده" />
    </div>
    <div className="dashboard-grid">
      <Card><div className="section-title"><div><h2>وضعیت کاربران</h2><p>ترکیب پلن و وضعیت حساب‌ها</p></div><ShieldCheck size={20} /></div><div className="metric-list">
        <MetricLink label="فعال" value={numberFa(data.users.active)} onClick={() => navigate('/users?state=active')} />
        <MetricLink label="پریمیوم" value={numberFa(data.users.premium)} onClick={() => navigate('/users?plan=premium')} />
        <MetricLink label="رایگان" value={numberFa(data.users.free)} onClick={() => navigate('/users?plan=free')} />
        <MetricLink label="مسدود" value={numberFa(data.users.banned)} onClick={() => navigate('/users?state=banned')} />
      </div></Card>
      <Card><div className="section-title"><div><h2>جریان مالی هنرمندان</h2><p>تعهد و پرداخت واقعی</p></div><WalletCards size={20} /></div><div className="metric-list">
        <MetricLink label="درآمد ثبت‌شده هنرمندان" value={moneyFa(data.money.artist_earned_total)} onClick={() => navigate('/finance?tab=earnings')} />
        <MetricLink label="تسویه انجام‌شده" value={moneyFa(data.money.artist_paid_total)} onClick={() => navigate('/finance?tab=payouts&status=done')} />
        <MetricLink label="در انتظار تسویه" value={moneyFa(data.money.artist_pending_payout_total)} onClick={() => navigate('/finance?tab=payouts&status=open')} />
        <MetricLink label="پرداخت موفق کاربران" value={numberFa(data.money.successful_payments_count)} onClick={() => navigate('/finance?tab=payments&status=success')} />
      </div></Card>
    </div>
    <Card><div className="section-title"><div><h2>هنرمندان برتر</h2><p>رتبه‌بندی بر اساس تعداد استریم</p></div></div><div className="artist-rank-grid">{data.artists.top.map((artist, index) => <div className="artist-rank" key={artist.id}><span className="artist-rank__index">{numberFa(index + 1)}</span><div className="avatar avatar--lg">{artist.profile_image ? <img src={artist.profile_image} alt="" loading="lazy" /> : artist.name?.[0]}</div><div><strong>{artist.name}</strong><span>{numberFa(artist.streams)} استریم</span></div><b>{moneyFa(artist.earned)}</b></div>)}</div></Card>
    <div className="dashboard-grid dashboard-grid--tables">
      <Card><div className="section-title"><div><h2>آخرین پرداخت کاربران</h2><p>خریدهای اشتراک ثبت‌شده</p></div></div><DataTable<PaymentTransaction> rows={data.recent_transactions} columns={[
        { key:'user', title:'کاربر', render: x => <span dir="ltr">{x.user_phone}</span> },
        { key:'amount', title:'مبلغ', render: x => moneyFa(x.amount) },
        { key:'status', title:'وضعیت', render: x => <StatusBadge value={x.status} /> },
      ]} /></Card>
      <Card><div className="section-title"><div><h2>آخرین تسویه هنرمندان</h2><p>درخواست‌های برداشت درآمد</p></div></div><DataTable<DepositRequest> rows={data.recent_payouts} columns={[
        { key:'artist', title:'هنرمند', render: x => x.artist_name },
        { key:'amount', title:'مبلغ', render: x => moneyFa(x.amount) },
        { key:'status', title:'وضعیت', render: x => <StatusBadge value={x.status} /> },
      ]} /></Card>
    </div>
  </div>
}
