import { ArrowRight, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
export default function NotFoundPage(){return <div className="not-found"><div className="not-found__icon"><SearchX size={34}/></div><h1>این صفحه پیدا نشد</h1><p>آدرس واردشده در پنل مدیریت وجود ندارد.</p><Link className="button button--primary" to="/"><ArrowRight size={17}/>بازگشت به داشبورد</Link></div>}
