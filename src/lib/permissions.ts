import type { StoredAdmin } from './api'

export type ScreenKey = 'users'|'artists'|'release_add'|'releases'|'songs'|'albums'|'tags'|'plans'|'finance'|'content'|'playlists'|'support'
export type PermissionSection = { key:ScreenKey; title:string; description:string; route:string; details:Array<{key:string;label:string;hint?:string;hidden?:boolean}>; enableWithView?:string[] }

export const permissionSections:PermissionSection[]=[
 {key:'users',title:'کاربران',description:'مشاهده و مدیریت حساب کاربران',route:'/users',enableWithView:['users.edit','users.ban'],details:[{key:'users.edit',label:'ویرایش اطلاعات کاربر'},{key:'users.ban',label:'مسدود / رفع مسدودی'}]},
 {key:'artists',title:'هنرمندان',description:'پروفایل و احراز هویت هنرمندان',route:'/artists',enableWithView:['artists.edit','artists.kyc','artists.verify','artists.ban'],details:[{key:'artists.edit',label:'ایجاد و ویرایش هنرمند'},{key:'artists.kyc',label:'مشاهده مدارک هویتی',hint:'کد ملی، تصویر مدرک، تاریخ تولد و آدرس'},{key:'artists.verify',label:'تأیید یا رد احراز هویت'},{key:'artists.ban',label:'مسدود / رفع مسدودی حساب'},{key:'artists.delete',label:'حذف هنرمند'}]},
 {key:'release_add',title:'افزودن انتشار',description:'ساخت و تکمیل انتشار از طرف مدیریت',route:'/releases/add',enableWithView:['release_add.edit'],details:[{key:'release_add.edit',label:'ساخت و ویرایش انتشار و ترک‌ها',hidden:true},{key:'release_add.publish',label:'اجازه انتشار نهایی',hint:'انتشار فوری یا زمان‌بندی انتشار'}]},
 {key:'releases',title:'بررسی انتشارها',description:'صف بررسی انتشارهای هنرمندان',route:'/releases',enableWithView:['releases.review'],details:[{key:'releases.review',label:'درخواست اصلاح / رد / تأیید'},{key:'releases.publish',label:'انتشار یا زمان‌بندی'},{key:'releases.takedown',label:'خارج کردن / بازگردانی از دسترس'},{key:'releases.delete',label:'حذف دائمی انتشار'}]},
 {key:'songs',title:'آهنگ‌ها',description:'مدیریت کاتالوگ آهنگ',route:'/songs',enableWithView:['songs.edit','songs.takedown'],details:[{key:'songs.edit',label:'ویرایش متادیتا'},{key:'songs.takedown',label:'خارج کردن از دسترس'},{key:'songs.delete',label:'حذف دائمی'}]},
 {key:'albums',title:'آلبوم‌ها',description:'مدیریت کاتالوگ آلبوم',route:'/albums',enableWithView:['albums.edit','albums.takedown'],details:[{key:'albums.edit',label:'ویرایش آلبوم'},{key:'albums.takedown',label:'خارج کردن از دسترس'},{key:'albums.delete',label:'حذف دائمی'}]},
 {key:'tags',title:'تگ‌ها و دسته‌بندی',description:'ژانر، زیرژانر، حال‌وهوا و تگ‌ها',route:'/tags',enableWithView:['tags.edit'],details:[{key:'tags.edit',label:'ایجاد و ویرایش'},{key:'tags.delete',label:'حذف / ادغام دسته‌بندی'}]},
 {key:'plans',title:'پلن و قیمت‌گذاری',description:'تنظیمات حساس قیمت و پرداخت',route:'/plans',details:[{key:'plans.price',label:'تغییر قیمت اشتراک'},{key:'plans.payout',label:'تغییر ارزش پخش و حداقل تسویه'},{key:'plans.ads',label:'تغییر فاصله تبلیغ صوتی'}]},
 {key:'finance',title:'مالی و تسویه',description:'اطلاعات مالی و عملیات تسویه',route:'/finance',enableWithView:['finance.payments','finance.earnings','finance.payouts'],details:[{key:'finance.payments',label:'مشاهده پرداخت کاربران'},{key:'finance.earnings',label:'مشاهده درآمد هنرمندان'},{key:'finance.payouts',label:'مشاهده درخواست‌های تسویه'},{key:'finance.payout_review',label:'تأیید / رد درخواست تسویه'},{key:'finance.payout_pay',label:'ثبت پرداخت نهایی و شماره تراکنش'}]},
 {key:'content',title:'محتوا و پیشنهادها',description:'پروموشن، بنر و تبلیغ صوتی',route:'/content',enableWithView:['content.promotions','content.banners','content.audio_ads'],details:[{key:'content.promotions',label:'مدیریت پروموشن‌ها'},{key:'content.banners',label:'مدیریت بنرها'},{key:'content.audio_ads',label:'مدیریت تبلیغات صوتی'}]},
 {key:'playlists',title:'پلی‌لیست‌ها و بخش‌ها',description:'پلی‌لیست رسمی و چیدمان جستجو',route:'/playlists-sections',enableWithView:['playlists.playlists','playlists.sections'],details:[{key:'playlists.playlists',label:'مدیریت پلی‌لیست‌های رسمی'},{key:'playlists.sections',label:'مدیریت بخش‌ها و چیدمان جستجو'}]},
 {key:'support',title:'پشتیبانی و گزارش‌ها',description:'تیکت‌های پشتیبانی و گزارش کاربران',route:'/support',enableWithView:['support.tickets','support.reports'],details:[{key:'support.tickets',label:'مشاهده و رسیدگی به تیکت‌ها'},{key:'support.reports',label:'مشاهده و رسیدگی به گزارش‌ها'}]},
]
export const allPermissionKeys=permissionSections.flatMap(s=>[`${s.key}.view`,...s.details.map(d=>d.key)])
export const isOwnerAdmin=(u:StoredAdmin|null|undefined)=>Boolean(u?.is_owner_admin)
export const isEmployee=(u:StoredAdmin|null|undefined)=>Boolean(u?.is_employee&&!u?.is_staff)
export const can=(u:StoredAdmin|null|undefined,key:string)=>isOwnerAdmin(u)||Boolean(u?.permissions?.[key])
export const canAction=(u:StoredAdmin|null|undefined,screen:string,action:string)=>can(u,`${screen}.${action}`)
export const canView=(u:StoredAdmin|null|undefined,screen:ScreenKey)=>can(u,`${screen}.view`)
export const firstAllowedPath=(u:StoredAdmin|null|undefined)=>isOwnerAdmin(u)?'/':permissionSections.find(s=>canView(u,s.key))?.route||'/no-access'
export const emptyPermissions=()=>Object.fromEntries(allPermissionKeys.map(k=>[k,false])) as Record<string,boolean>
