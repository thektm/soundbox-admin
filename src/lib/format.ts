const fa = new Intl.NumberFormat('fa-IR')
const money = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 })
const preciseMoney = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 6 })
const dateTime = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
const dateTimeTehran = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const dateOnly = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' })

export const numberFa = (value: number | string | null | undefined) => fa.format(Number(value || 0))
export const moneyFa = (value: number | string | null | undefined) => `${money.format(Number(value || 0))} تومان`
export const preciseMoneyFa = (value: number | string | null | undefined) => {
  const numeric = Number(value || 0)
  return `${numeric === 0 ? '۰' : preciseMoney.format(numeric)} تومان`
}
export const dateFa = (value?: string | null) => value ? dateOnly.format(new Date(value)) : '—'
export const dateTimeFa = (value?: string | null) => value ? dateTime.format(new Date(value)) : '—'
export const dateTimeTehranFa = (value?: string | null) => value ? dateTimeTehran.format(new Date(value)) : '—'

export const statusFa: Record<string, string> = {
  pending: 'در انتظار', success: 'موفق', failed: 'ناموفق', approved: 'تأیید شده', rejected: 'رد شده', done: 'انجام شده',
  open: 'باز', in_progress: 'در حال بررسی', answered: 'پاسخ داده شده', closed: 'بسته',
  draft: 'پیش‌نویس', in_review: 'در حال بررسی', changes_requested: 'نیازمند اصلاح', accepted: 'پذیرفته شده',
  scheduled: 'زمان‌بندی شده', live: 'منتشر شده', taken_down: 'از دسترس خارج', published: 'منتشر شده', deleted: 'از دسترس خارج',
  free: 'رایگان', premium: 'پریمیوم', active: 'فعال', banned: 'مسدود', running: 'در حال اجرا', upcoming: 'آینده', ended: 'پایان یافته', disabled: 'غیرفعال',
}

export const labelStatus = (value?: string | null) => value ? (statusFa[value] || 'نامشخص') : 'نامشخص'

export const hasPersian = (value: string) => /[\u0600-\u06FF]/.test(value)

export const paymentMethodFa = (value?: string | null) => {
  const methods: Record<string, string> = { zarinpal: 'زرین‌پال', mock: 'شبیه‌سازی پرداخت' }
  return value ? (methods[value.toLowerCase()] || 'درگاه پرداخت') : 'شبیه‌سازی فعلی'
}
