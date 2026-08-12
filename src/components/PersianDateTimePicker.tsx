import { DtPicker, convertToGregorian, convertToJalali } from 'react-calendar-datetime-picker'
import 'react-calendar-datetime-picker/style.css'

type CalendarDay = { year:number; month:number; day:number; hour?:number; minute?:number }

type Props = {
  value: string
  onChange: (isoValue:string) => void
  placeholder?: string
}

const TEHRAN_TIME_ZONE = 'Asia/Tehran'
const tehranFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function tehranParts(value: Date): Required<CalendarDay> & { second:number } {
  const parts = Object.fromEntries(tehranFormatter.formatToParts(value).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
  return { year:parts.year, month:parts.month, day:parts.day, hour:parts.hour, minute:parts.minute, second:parts.second }
}

function isoToJalali(value: string): CalendarDay {
  const parts = tehranParts(new Date(value))
  const jalali = convertToJalali({ year:parts.year, month:parts.month, day:parts.day }) as CalendarDay
  return { ...jalali, hour:parts.hour, minute:parts.minute }
}

function tehranWallTimeToIso(value: CalendarDay): string {
  const gregorian = convertToGregorian(value) as CalendarDay
  const wanted = Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day, value.hour ?? 0, value.minute ?? 0, 0, 0)
  let instant = wanted

  // Resolve the IANA timezone offset from the desired Tehran wall-clock time.
  for (let i = 0; i < 3; i += 1) {
    const actual = tehranParts(new Date(instant))
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0)
    const delta = wanted - represented
    instant += delta
    if (!delta) break
  }

  const verified = tehranParts(new Date(instant))
  if (verified.year !== gregorian.year || verified.month !== gregorian.month || verified.day !== gregorian.day || verified.hour !== (value.hour ?? 0) || verified.minute !== (value.minute ?? 0)) {
    throw new Error('زمان انتخاب‌شده در منطقه زمانی ایران معتبر نیست.')
  }
  return new Date(instant).toISOString()
}

export function PersianDateTimePicker({ value, onChange, placeholder='انتخاب تاریخ و ساعت' }: Props) {
  return <div className="persian-date-picker" dir="rtl">
    <DtPicker
      initValue={isoToJalali(value)}
      onChange={(raw: unknown) => {
        if (!raw || Array.isArray(raw) || typeof raw !== 'object' || !('year' in raw)) return
        onChange(tehranWallTimeToIso(raw as CalendarDay))
      }}
      type="single"
      calendarSystem="jalali"
      withTime
      showTimeInput
      todayBtn
      dark
      autoClose={false}
      isRequired
      dateFormat="YYYY/MM/DD"
      placeholder={placeholder}
      inputClass="persian-date-input"
      calenderModalClass="admin-persian-calendar"
    />
    <small>زمان انتخابی بر اساس ساعت رسمی ایران ثبت می‌شود.</small>
  </div>
}
