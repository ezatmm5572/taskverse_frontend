import { ref, watchEffect } from 'vue'

// Tiny i18n layer: English strings are the keys; Arabic falls back to English when a key is missing.
export const lang = ref((() => { try { return localStorage.getItem('taskverse-lang') || 'en' } catch { return 'en' } })())

const ar = {
  // navigation / chrome
  'Overview': 'نظرة عامة', 'Tasks': 'المهام', 'Teams': 'الفرق', 'Members': 'الأعضاء',
  'My assignments': 'مهامي', 'Profile & security': 'الملف الشخصي والأمان', 'WORKSPACE': 'مساحة العمل',
  'Workspace': 'مساحة العمل', 'Refresh Session': 'تحديث الجلسة', 'Create Task': 'إنشاء مهمة', 'New Task': 'مهمة جديدة',
  'Create task': 'إنشاء مهمة', 'Create Team': 'إنشاء فريق', 'Invite Member': 'دعوة عضو',
  'Light': 'فاتح', 'Dark': 'داكن', 'Auto': 'تلقائي', 'Notifications': 'الإشعارات', 'Mark all read': 'تحديد الكل كمقروء',
  "You're all caught up.": 'لا توجد إشعارات جديدة.',
  'Good day,': 'يوم سعيد،',
  'Focus on your high-impact priorities and keep team momentum high.': 'ركّز على أولوياتك الأهم وحافظ على زخم الفريق.',
  // statuses
  'To do': 'قيد الانتظار', 'In progress': 'قيد التنفيذ', 'Completed': 'مكتملة', 'Blocked': 'معطّلة',
  // tasks table
  'Task Management': 'إدارة المهام', 'Comprehensive tracker for all tasks across your teams.': 'متابعة شاملة لكل مهام فرقك.',
  'Task': 'المهمة', 'Team': 'الفريق', 'Status': 'الحالة', 'Start Date': 'تاريخ البدء', 'Due Date': 'تاريخ التسليم', 'Actions': 'الإجراءات',
  'All': 'الكل', 'All teams': 'كل الفرق', 'All tags': 'كل التصنيفات',
  'No tasks found in this view.': 'لا توجد مهام في هذا العرض.',
  'List': 'قائمة', 'Board': 'لوحة', 'Calendar': 'تقويم', 'Sort': 'ترتيب',
  'Recent Tasks': 'أحدث المهام', 'View all': 'عرض الكل',
  // overview stats
  'Total Tasks': 'إجمالي المهام', 'Overdue / Blocked': 'متأخرة / معطّلة', 'Active momentum': 'نشاط مستمر',
  // team & member
  'Teams & Workgroups': 'الفرق ومجموعات العمل', 'Directory of Members': 'دليل الأعضاء',
  'Assigned to Me': 'المسندة إليّ', 'Add members': 'إضافة أعضاء', 'Close': 'إغلاق', 'Cancel': 'إلغاء',
  'Save changes': 'حفظ التعديلات', 'Delete': 'حذف', 'Delete team': 'حذف الفريق', 'Add': 'إضافة', 'Send': 'إرسال',
  'Select all': 'تحديد الكل', 'Clear all': 'إلغاء التحديد', 'Clear': 'مسح',
  // task card
  'STATUS': 'الحالة', 'PRIORITY': 'الأولوية', 'DETAILS': 'التفاصيل', 'PEOPLE': 'الأشخاص', 'TAGS': 'التصنيفات',
  'SUBTASKS': 'المهام الفرعية', 'ATTACHMENTS': 'المرفقات', 'COMMENTS': 'التعليقات', 'ACTIVITY': 'النشاط',
  'Title': 'العنوان', 'Description': 'الوصف', 'Low': 'منخفضة', 'Medium': 'متوسطة', 'High': 'عالية', 'Urgent': 'عاجلة',
  'Write a comment…': 'اكتب تعليقًا…', 'Add a subtask…': 'أضف مهمة فرعية…', 'Add a tag…': 'أضف تصنيفًا…',
  'TEAM NAME': 'اسم الفريق', 'MEMBERS': 'الأعضاء', 'ADD MEMBERS': 'إضافة أعضاء', 'TEAMS': 'الفرق', 'TASKS': 'المهام', 'PROFILE': 'البيانات',
  // insights
  'Completion by team': 'الإنجاز حسب الفريق', 'Member workload': 'عبء العمل لكل عضو', 'Most overdue': 'الأكثر تأخرًا',
  'Recent activity': 'آخر النشاطات', 'Status breakdown': 'توزيع الحالات', 'Nothing overdue 🎉': 'لا يوجد تأخير 🎉', 'No activity yet.': 'لا يوجد نشاط بعد.',
  'Today': 'اليوم', 'Mon': 'الإثنين', 'Tue': 'الثلاثاء', 'Wed': 'الأربعاء', 'Thu': 'الخميس', 'Fri': 'الجمعة', 'Sat': 'السبت', 'Sun': 'الأحد',
  'Selected': 'محدد', 'Mark completed': 'تحديد كمكتملة', 'Mark in progress': 'تحديد كقيد التنفيذ', 'Delete selected': 'حذف المحدد'
}
const dict = { ar }

export const dictFor = l => dict[l] || {}
export const t = key => (lang.value !== 'en' && dict[lang.value]?.[key]) || key
export const isRtl = () => lang.value === 'ar'
export function toggleLang() {
  lang.value = lang.value === 'ar' ? 'en' : 'ar'
  try { localStorage.setItem('taskverse-lang', lang.value) } catch { /* ignore */ }
}

watchEffect(() => {
  document.documentElement.lang = lang.value
  document.documentElement.dir = lang.value === 'ar' ? 'rtl' : 'ltr'
})
