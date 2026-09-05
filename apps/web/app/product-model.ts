export type ProductLocale = 'en-US' | 'ar-SA';

export type ProductDirection = 'ltr' | 'rtl';

export interface LocalizedText {
  en: string;
  ar: string;
}

export type ProductViewId =
  | 'home'
  | 'ai-command'
  | 'company-intelligence'
  | 'market-intelligence'
  | 'icp-personas'
  | 'strategy'
  | 'campaigns'
  | 'content-studio'
  | 'creative-studio'
  | 'seo'
  | 'sales-crm'
  | 'customer-success'
  | 'analytics-experiments'
  | 'finance-cfo'
  | 'automation'
  | 'knowledge'
  | 'approvals'
  | 'workflows-operations'
  | 'ai-team'
  | 'business-mentor'
  | 'billing-usage'
  | 'settings'
  | 'admin-governance';

export type ProductDataState<T> =
  | { kind: 'loading' }
  | { kind: 'empty'; message: LocalizedText }
  | { kind: 'unavailable'; message: LocalizedText; compositionEndpoint: string }
  | { kind: 'permission-denied'; permission: string }
  | { kind: 'entitlement-unavailable'; entitlement: string }
  | { kind: 'error'; message: LocalizedText }
  | { kind: 'ready'; data: T };

export interface ProductAccess {
  tenantContext: 'missing' | 'available';
  permissions: readonly string[];
  entitlements: readonly string[];
}

export type ProductAccessState =
  'missing-context' | 'permission-denied' | 'entitlement-unavailable' | 'available';

export interface ProductSection {
  title: LocalizedText;
  description: LocalizedText;
  items: LocalizedText[];
}

export interface ProductDataSource {
  label: LocalizedText;
  endpoint: string;
  status: 'available' | 'composition-required';
}

export interface ProductView {
  id: ProductViewId;
  group: ProductNavigationGroupId;
  route: string;
  label: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  requiredPermission: string;
  entitlement?: string;
  approvalSensitivity: 'none' | 'read' | 'decision-required';
  dataSources: ProductDataSource[];
  sections: ProductSection[];
}

export type ProductNavigationGroupId =
  | 'overview'
  | 'intelligence'
  | 'marketing'
  | 'revenue'
  | 'insights'
  | 'operations'
  | 'ai-platform'
  | 'management';

export interface ProductNavigationGroup {
  id: ProductNavigationGroupId;
  label: LocalizedText;
  views: ProductViewId[];
}

const text = (en: string, ar: string): LocalizedText => ({ en, ar });

const item = text;

const source = (
  label: LocalizedText,
  endpoint: string,
  status: ProductDataSource['status'] = 'composition-required',
): ProductDataSource => ({ label, endpoint, status });

const section = (
  title: LocalizedText,
  description: LocalizedText,
  items: LocalizedText[],
): ProductSection => ({ title, description, items });

export const productNavigation: ProductNavigationGroup[] = [
  { id: 'overview', label: text('Overview', 'نظرة عامة'), views: ['home', 'ai-command'] },
  {
    id: 'intelligence',
    label: text('Intelligence', 'الاستخبارات'),
    views: ['company-intelligence', 'market-intelligence', 'icp-personas', 'strategy'],
  },
  {
    id: 'marketing',
    label: text('Marketing', 'التسويق'),
    views: ['campaigns', 'content-studio', 'creative-studio', 'seo'],
  },
  {
    id: 'revenue',
    label: text('Revenue', 'الإيرادات'),
    views: ['sales-crm', 'customer-success'],
  },
  {
    id: 'insights',
    label: text('Insights', 'الرؤى'),
    views: ['analytics-experiments', 'finance-cfo'],
  },
  {
    id: 'operations',
    label: text('Operations', 'العمليات'),
    views: ['automation', 'knowledge', 'approvals', 'workflows-operations'],
  },
  {
    id: 'ai-platform',
    label: text('AI Platform', 'منصة الذكاء الاصطناعي'),
    views: ['ai-team', 'business-mentor'],
  },
  {
    id: 'management',
    label: text('Management', 'الإدارة'),
    views: ['billing-usage', 'settings', 'admin-governance'],
  },
];

export const productViews: ProductView[] = [
  {
    id: 'home',
    group: 'overview',
    route: '/',
    label: text('Executive Dashboard', 'لوحة القيادة التنفيذية'),
    title: text('Executive operating view', 'عرض التشغيل التنفيذي'),
    description: text(
      'A decision surface for business health, operating risks, approvals, and next-best actions—not a vanity-metrics dashboard.',
      'واجهة قرار لصحة الأعمال والمخاطر التشغيلية والموافقات والإجراءات التالية، وليست لوحة مقاييس شكلية.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Canonical executive composition', 'تجميع تنفيذي قانوني'),
        'composition:executive-dashboard',
      ),
      source(
        text('Workflow readiness', 'جاهزية سير العمل'),
        'GET /workflows/:workflowId/readiness',
        'available',
      ),
      source(
        text('Marketing run state', 'حالة تشغيل التسويق'),
        'GET /marketing-os/runs/:planId',
        'available',
      ),
    ],
    sections: [
      section(
        text('Operating signals', 'إشارات التشغيل'),
        text(
          'Values appear only after a tenant-bound composition returns canonical data.',
          'تظهر القيم فقط بعد إرجاع تجميع قانوني مرتبط بالمستأجر.',
        ),
        [
          item('Business health and risks', 'صحة الأعمال والمخاطر'),
          item(
            'Pipeline, revenue, and marketing performance',
            'خط الأنابيب والإيرادات وأداء التسويق',
          ),
          item('Customer health and active campaigns', 'صحة العملاء والحملات النشطة'),
        ],
      ),
      section(
        text('Decisions requiring attention', 'قرارات تتطلب اهتماماً'),
        text(
          'Approval, workflow, and AI activity signals preserve their source state.',
          'تحافظ إشارات الموافقات وسير العمل ونشاط الذكاء الاصطناعي على حالة مصدرها.',
        ),
        [
          item('Approval queue and workflow blockers', 'قائمة الموافقات وعوائق سير العمل'),
          item('AI activity and governed cost', 'نشاط الذكاء الاصطناعي والتكلفة المحكومة'),
          item('Recommendations with evidence and confidence', 'توصيات مع الأدلة والثقة'),
        ],
      ),
    ],
  },
  {
    id: 'ai-command',
    group: 'overview',
    route: '/ai-command',
    label: text('AI Command Center', 'مركز قيادة الذكاء الاصطناعي'),
    title: text('Command the operating system', 'إدارة نظام التشغيل'),
    description: text(
      'A contextual intent surface for the canonical AI Marketing OS, grounded in active workflows, artifacts, approvals, and evidence.',
      'واجهة نية سياقية لنظام التسويق القانوني بالذكاء الاصطناعي، مبنية على سير العمل والقطع والموافقات والأدلة النشطة.',
    ),
    requiredPermission: 'workflow:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Canonical agent registry', 'سجل الوكلاء القانوني'), 'GET /agents', 'available'),
      source(
        text('Marketing OS run', 'تشغيل نظام التسويق'),
        'GET /marketing-os/runs/:planId',
        'available',
      ),
    ],
    sections: [
      section(
        text('Business intent', 'نية العمل'),
        text(
          'Suggested domain entry points never imply an executed tool action.',
          'لا تعني نقاط الدخول المقترحة تنفيذ إجراء أداة.',
        ),
        [
          item('Intent, objective, and operating context', 'النية والهدف وسياق التشغيل'),
          item('Recommended agents and capabilities', 'الوكلاء والقدرات الموصى بها'),
          item(
            'Trace, evidence, artifact, and handoff references',
            'مراجع التتبع والأدلة والقطع والتسليم',
          ),
        ],
      ),
      section(
        text('Execution guardrails', 'ضوابط التنفيذ'),
        text(
          'External effects require canonical Tool Gateway confirmation and approval where required.',
          'تتطلب التأثيرات الخارجية تأكيد بوابة الأدوات القانونية والموافقة عند الحاجة.',
        ),
        [
          item(
            'Tenant, permission, and entitlement checks',
            'فحوص المستأجر والصلاحيات والاستحقاقات',
          ),
          item('Approval state before sensitive execution', 'حالة الموافقة قبل التنفيذ الحساس'),
        ],
      ),
    ],
  },
  {
    id: 'company-intelligence',
    group: 'intelligence',
    route: '/company-intelligence',
    label: text('Company Intelligence', 'استخبارات الشركة'),
    title: text('Company intelligence', 'استخبارات الشركة'),
    description: text(
      'A source-aware company profile for business model, positioning, opportunities, and evidence.',
      'ملف شركة واعٍ بالمصادر لنموذج الأعمال والتموضع والفرص والأدلة.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Company intelligence composition', 'تجميع استخبارات الشركة'),
        'composition:company-intelligence',
      ),
    ],
    sections: [
      section(
        text('Company profile', 'ملف الشركة'),
        text(
          'Canonical profile fields retain evidence and confidence rather than inferred facts.',
          'تحافظ حقول الملف القانوني على الأدلة والثقة بدلاً من الحقائق المستنتجة.',
        ),
        [
          item('Business model, products, and services', 'نموذج الأعمال والمنتجات والخدمات'),
          item('Positioning, strengths, and weaknesses', 'التموضع ونقاط القوة والضعف'),
          item('Opportunities, evidence, and confidence', 'الفرص والأدلة والثقة'),
        ],
      ),
    ],
  },
  {
    id: 'market-intelligence',
    group: 'intelligence',
    route: '/market-intelligence',
    label: text('Market Intelligence', 'استخبارات السوق'),
    title: text('Market intelligence', 'استخبارات السوق'),
    description: text(
      'Market snapshots are evidence-bounded and never fabricate competitor facts.',
      'لقطات السوق مقيدة بالأدلة ولا تفبرك حقائق المنافسين.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Market intelligence snapshots', 'لقطات استخبارات السوق'),
        'composition:market-intelligence',
      ),
    ],
    sections: [
      section(
        text('Market snapshot', 'لقطة السوق'),
        text(
          'Drill down only into available canonical research.',
          'التعمق فقط في البحث القانوني المتاح.',
        ),
        [
          item('Competitors and positioning', 'المنافسون والتموضع'),
          item('Trends, opportunities, and threats', 'الاتجاهات والفرص والتهديدات'),
          item('Evidence sources and confidence', 'مصادر الأدلة والثقة'),
        ],
      ),
    ],
  },
  {
    id: 'icp-personas',
    group: 'intelligence',
    route: '/icp-personas',
    label: text('ICP & Personas', 'العميل المثالي والشخصيات'),
    title: text('ICP and personas', 'العميل المثالي والشخصيات'),
    description: text(
      'Consumes canonical ICP profiles and assessments without recreating the advanced ICP engine.',
      'يستهلك ملفات وتقييمات العميل المثالي القانونية من دون إعادة إنشاء المحرك المتقدم.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Canonical ICP profiles', 'ملفات العميل المثالي القانونية'),
        'composition:icp-profiles',
      ),
    ],
    sections: [
      section(
        text('Fit model', 'نموذج الملاءمة'),
        text(
          'Criteria, exclusions, triggers, and buyer roles remain traceable to canonical evidence.',
          'تبقى المعايير والاستبعادات والمحركات وأدوار المشترين قابلة للتتبع إلى الأدلة القانونية.',
        ),
        [
          item('Fit criteria and exclusions', 'معايير الملاءمة والاستبعادات'),
          item('Buyer roles and buying triggers', 'أدوار المشترين ومحركات الشراء'),
          item('Account assessment and fit tier', 'تقييم الحساب وفئة الملاءمة'),
        ],
      ),
    ],
  },
  {
    id: 'strategy',
    group: 'intelligence',
    route: '/strategy',
    label: text('Strategy', 'الاستراتيجية'),
    title: text('Strategy operating plan', 'خطة تشغيل الاستراتيجية'),
    description: text(
      'A version-aware strategy workspace with priorities, evidence, confidence, and approval state.',
      'مساحة عمل استراتيجية واعية بالإصدارات مع الأولويات والأدلة والثقة وحالة الموافقة.',
    ),
    requiredPermission: 'artifact:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Canonical strategy versions', 'إصدارات الاستراتيجية القانونية'),
        'composition:marketing-strategy',
      ),
    ],
    sections: [
      section(
        text('Strategic direction', 'الاتجاه الاستراتيجي'),
        text(
          'Strategy stays an approved artifact, not a parallel strategy engine.',
          'تبقى الاستراتيجية قطعة معتمدة وليست محرك استراتيجية موازياً.',
        ),
        [
          item('Priorities and campaign recommendations', 'الأولويات وتوصيات الحملات'),
          item('Content pillars and KPIs', 'ركائز المحتوى ومؤشرات الأداء'),
          item(
            'Roadmap, assumptions, evidence, and confidence',
            'خارطة الطريق والافتراضات والأدلة والثقة',
          ),
        ],
      ),
    ],
  },
  {
    id: 'campaigns',
    group: 'marketing',
    route: '/campaigns',
    label: text('Campaigns', 'الحملات'),
    title: text('Campaign workspace', 'مساحة عمل الحملات'),
    description: text(
      'Campaign objectives, audiences, offers, budgets, workflows, and approval readiness stay connected to canonical execution artifacts.',
      'تبقى أهداف الحملات والجماهير والعروض والميزانيات وسير العمل وجاهزية الموافقة مرتبطة بقطع التنفيذ القانونية.',
    ),
    requiredPermission: 'marketing:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Marketing execution artifacts', 'قطع تنفيذ التسويق'),
        'composition:marketing-execution',
      ),
    ],
    sections: [
      section(
        text('Campaign readiness', 'جاهزية الحملة'),
        text(
          'Publishing is unavailable until canonical Approval and Tool Gateway confirmations exist.',
          'النشر غير متاح حتى وجود تأكيدات الموافقة وبوابة الأدوات القانونية.',
        ),
        [
          item('Objective, audience, offer, and funnel', 'الهدف والجمهور والعرض والقمع'),
          item('Budget, assets, KPIs, and workflow', 'الميزانية والأصول ومؤشرات الأداء وسير العمل'),
          item('Status and approval readiness', 'الحالة وجاهزية الموافقة'),
        ],
      ),
    ],
  },
  {
    id: 'content-studio',
    group: 'marketing',
    route: '/content-studio',
    label: text('Content Studio', 'استوديو المحتوى'),
    title: text('Content Studio', 'استوديو المحتوى'),
    description: text(
      'Briefs, drafts, optimization, quality flags, evidence, and approval state for canonical content artifacts.',
      'موجزات ومسودات وتحسين وأعلام جودة وأدلة وحالة موافقة لقطع المحتوى القانونية.',
    ),
    requiredPermission: 'artifact:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Content execution artifacts', 'قطع تنفيذ المحتوى'),
        'composition:content-artifacts',
      ),
    ],
    sections: [
      section(
        text('Content production', 'إنتاج المحتوى'),
        text(
          'Drafts remain drafts until the canonical approval state changes.',
          'تبقى المسودات مسودات حتى تتغير حالة الموافقة القانونية.',
        ),
        [
          item(
            'Brief, channel, funnel stage, and CTA',
            'الموجز والقناة ومرحلة القمع والدعوة للإجراء',
          ),
          item('Optimization and quality flags', 'التحسين وأعلام الجودة'),
          item('Evidence and approval state', 'الأدلة وحالة الموافقة'),
        ],
      ),
    ],
  },
  {
    id: 'creative-studio',
    group: 'marketing',
    route: '/creative-studio',
    label: text('Creative Studio', 'الاستوديو الإبداعي'),
    title: text('Creative Studio', 'الاستوديو الإبداعي'),
    description: text(
      'Concepts, visual direction, copy variants, testing plans, and asset readiness with approval visibility.',
      'المفاهيم والتوجيه البصري ونسخ النص وخطط الاختبار وجاهزية الأصل مع وضوح الموافقة.',
    ),
    requiredPermission: 'artifact:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Creative execution artifacts', 'قطع التنفيذ الإبداعي'),
        'composition:creative-artifacts',
      ),
    ],
    sections: [
      section(
        text('Creative readiness', 'الجاهزية الإبداعية'),
        text(
          'No external publishing control is presented by this workspace.',
          'لا تعرض مساحة العمل هذه أي تحكم في النشر الخارجي.',
        ),
        [
          item('Concept and visual direction', 'المفهوم والتوجيه البصري'),
          item('Copy variants and testing plan', 'نسخ النص وخطة الاختبار'),
          item('Asset readiness and approval state', 'جاهزية الأصل وحالة الموافقة'),
        ],
      ),
    ],
  },
  {
    id: 'seo',
    group: 'marketing',
    route: '/seo',
    label: text('SEO', 'تحسين محركات البحث'),
    title: text('SEO workspace', 'مساحة عمل تحسين محركات البحث'),
    description: text(
      'Keyword, intent, brief, recommendation, and KPI surfaces that remain evidence-aware.',
      'أسطح الكلمات المفتاحية والنية والموجز والتوصية ومؤشرات الأداء التي تبقى واعية بالأدلة.',
    ),
    requiredPermission: 'marketing:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('SEO intelligence composition', 'تجميع استخبارات SEO'), 'composition:seo'),
    ],
    sections: [
      section(
        text('Search opportunity', 'فرصة البحث'),
        text(
          'Recommendations are not applied directly to external properties.',
          'لا تطبق التوصيات مباشرة على الخصائص الخارجية.',
        ),
        [
          item('Keyword clusters and search intent', 'مجموعات الكلمات المفتاحية ونية البحث'),
          item('Content briefs and on-page recommendations', 'موجزات المحتوى وتوصيات الصفحة'),
          item('Technical recommendations and KPIs', 'التوصيات التقنية ومؤشرات الأداء'),
        ],
      ),
    ],
  },
  {
    id: 'sales-crm',
    group: 'revenue',
    route: '/sales-crm',
    label: text('Sales / CRM', 'المبيعات وإدارة العملاء'),
    title: text('Revenue workspace', 'مساحة عمل الإيرادات'),
    description: text(
      'One canonical workspace for leads, accounts, opportunities, scoring, pipeline, forecast, and proposal artifacts.',
      'مساحة عمل قانونية واحدة للعملاء المحتملين والحسابات والفرص والتقييم وخط الأنابيب والتوقعات وقطع المقترحات.',
    ),
    requiredPermission: 'sales:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Sales intelligence', 'استخبارات المبيعات'), 'composition:sales-intelligence'),
    ],
    sections: [
      section(
        text('Revenue operations', 'عمليات الإيرادات'),
        text(
          'Proposal sending is never implied by an approval state alone.',
          'لا يعني إرسال المقترح بمجرد حالة الموافقة.',
        ),
        [
          item('Leads, accounts, and opportunities', 'العملاء المحتملون والحسابات والفرص'),
          item('Lead scoring, pipeline, and forecast', 'تقييم العملاء وخط الأنابيب والتوقعات'),
          item(
            'Draft, approval required, approved, rejected, and conditions',
            'مسودة وموافقة مطلوبة ومعتمد ومرفوض وشروط',
          ),
        ],
      ),
    ],
  },
  {
    id: 'customer-success',
    group: 'revenue',
    route: '/customer-success',
    label: text('Customer Success', 'نجاح العملاء'),
    title: text('Customer Success', 'نجاح العملاء'),
    description: text(
      'Customer health, churn risk, causes, renewals, and expansion recommendations remain advisory and evidence-bounded.',
      'تبقى صحة العملاء ومخاطر الانحسار والأسباب والتجديدات وتوصيات التوسع استشارية ومقيدة بالأدلة.',
    ),
    requiredPermission: 'customer_success:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Customer Success Intelligence', 'استخبارات نجاح العملاء'),
        'composition:customer-success',
      ),
    ],
    sections: [
      section(
        text('Customer health', 'صحة العميل'),
        text('Risk scores are recommendations, not facts.', 'درجات المخاطر توصيات وليست حقائق.'),
        [
          item('Health status and churn risk', 'حالة الصحة ومخاطر الانحسار'),
          item('Causes and recommended actions', 'الأسباب والإجراءات الموصى بها'),
          item('Renewal and expansion opportunity', 'فرصة التجديد والتوسع'),
        ],
      ),
    ],
  },
  {
    id: 'analytics-experiments',
    group: 'insights',
    route: '/analytics-experiments',
    label: text('Analytics & Experiments', 'التحليلات والتجارب'),
    title: text('Analytics and experiments', 'التحليلات والتجارب'),
    description: text(
      'Performance, attribution, and experiments reflect the current deterministic evaluator and metric provenance.',
      'يعكس الأداء والإسناد والتجارب المقيم الحتمي الحالي ومصدر المقاييس.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Analytics composition', 'تجميع التحليلات'), 'composition:analytics'),
    ],
    sections: [
      section(
        text('Performance and attribution', 'الأداء والإسناد'),
        text(
          'No claim of statistical significance or elapsed-time decay is made unless canonical data supports it.',
          'لا يوجد ادعاء بالدلالة الإحصائية أو التلاشي الزمني المنقضي ما لم تدعمه البيانات القانونية.',
        ),
        [
          item('Funnel, conversion, CAC, ROAS, LTV', 'القمع والتحويل وCAC وROAS وLTV'),
          item('Weighted pipeline and attribution', 'خط الأنابيب المرجح والإسناد'),
          item(
            'Experiment evaluator, recommendations, and provenance',
            'مقيم التجربة والتوصيات والمصدر',
          ),
        ],
      ),
    ],
  },
  {
    id: 'finance-cfo',
    group: 'insights',
    route: '/finance-cfo',
    label: text('CFO / Finance', 'المدير المالي والمالية'),
    title: text('CFO intelligence', 'استخبارات المدير المالي'),
    description: text(
      'Profitability, contribution, margin, scenario, and recommendation surfaces expose ACTUAL, ESTIMATED, or MODELED provenance.',
      'تعرض أسطح الربحية والمساهمة والهامش والسيناريو والتوصية مصدر ACTUAL أو ESTIMATED أو MODELED.',
    ),
    requiredPermission: 'finance:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('CFO intelligence composition', 'تجميع استخبارات المدير المالي'),
        'composition:cfo-intelligence',
      ),
    ],
    sections: [
      section(
        text('Financial operating view', 'عرض التشغيل المالي'),
        text(
          'The interface does not invent financial values or claim unsupported forecasting.',
          'لا تخترع الواجهة قيماً مالية ولا تدعي توقعات غير مدعومة.',
        ),
        [
          item(
            'Profitability, contribution, and gross margin',
            'الربحية والمساهمة والهامش الإجمالي',
          ),
          item('Scenarios and financial recommendations', 'السيناريوهات والتوصيات المالية'),
          item(
            'Forecast surface when canonical data is available',
            'سطح التوقعات عند توفر البيانات القانونية',
          ),
        ],
      ),
    ],
  },
  {
    id: 'automation',
    group: 'operations',
    route: '/automation',
    label: text('Automation', 'الأتمتة'),
    title: text('Automation control', 'التحكم في الأتمتة'),
    description: text(
      'Rules, triggers, conditions, schedules, workflow bindings, and run state invoke the canonical Workflow Runtime.',
      'تستدعي القواعد والمحفزات والشروط والجداول وربط سير العمل وحالة التشغيل وقت تشغيل سير العمل القانوني.',
    ),
    requiredPermission: 'automation:admin',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Automation definitions', 'تعريفات الأتمتة'), 'composition:automation'),
    ],
    sections: [
      section(
        text('Automation design', 'تصميم الأتمتة'),
        text(
          'The frontend never becomes an execution engine.',
          'لا تصبح الواجهة الأمامية محرك تنفيذ.',
        ),
        [
          item('Rules, triggers, and conditions', 'القواعد والمحفزات والشروط'),
          item('Actions, schedules, and workflow bindings', 'الإجراءات والجداول وربط سير العمل'),
          item('Run status and approval gates', 'حالة التشغيل وبوابات الموافقة'),
        ],
      ),
    ],
  },
  {
    id: 'knowledge',
    group: 'operations',
    route: '/knowledge',
    label: text('Knowledge & Documents', 'المعرفة والمستندات'),
    title: text('Knowledge and documents', 'المعرفة والمستندات'),
    description: text(
      'Canonical documents, ingestion state, search results, citations, and source references—not a separate RAG system.',
      'المستندات القانونية وحالة الاستيعاب ونتائج البحث والاستشهادات ومراجع المصدر، وليست نظام RAG منفصل.',
    ),
    requiredPermission: 'artifact:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Canonical knowledge layer', 'طبقة المعرفة القانونية'), 'composition:knowledge'),
    ],
    sections: [
      section(
        text('Evidence workspace', 'مساحة عمل الأدلة'),
        text(
          'Every retrieval surface retains source references and unavailable states.',
          'يحتفظ كل سطح استرجاع بمراجع المصدر وحالات عدم التوفر.',
        ),
        [
          item('Documents and ingestion state', 'المستندات وحالة الاستيعاب'),
          item('Search results and knowledge chunks', 'نتائج البحث ومقاطع المعرفة'),
          item('Citations and source references', 'الاستشهادات ومراجع المصدر'),
        ],
      ),
    ],
  },
  {
    id: 'approvals',
    group: 'operations',
    route: '/approvals',
    label: text('Approvals', 'الموافقات'),
    title: text('Approval Center', 'مركز الموافقات'),
    description: text(
      'A tenant-safe queue for pending and terminal canonical approval records.',
      'قائمة آمنة للمستأجر لسجلات الموافقة القانونية المعلقة والنهائية.',
    ),
    requiredPermission: 'approval:decide',
    approvalSensitivity: 'decision-required',
    dataSources: [
      source(
        text('Canonical approval API', 'واجهة الموافقة القانونية'),
        'GET /approvals',
        'available',
      ),
    ],
    sections: [
      section(
        text('Approval review', 'مراجعة الموافقة'),
        text(
          'Only a human context with approval:decide may submit a decision. Agents cannot self-approve.',
          'فقط سياق بشري يملك approval:decide يمكنه إرسال قرار. لا يمكن للوكلاء اعتماد أنفسهم.',
        ),
        [
          item('Artifact or request type and requester', 'نوع القطعة أو الطلب ومقدمه'),
          item('Workflow, evidence, risk, and conditions', 'سير العمل والأدلة والمخاطر والشروط'),
          item('Approved, approved with conditions, and rejected', 'معتمد ومعتمد بشروط ومرفوض'),
        ],
      ),
    ],
  },
  {
    id: 'workflows-operations',
    group: 'operations',
    route: '/workflows-operations',
    label: text('Workflows / Operations', 'سير العمل والعمليات'),
    title: text('Workflow operations', 'عمليات سير العمل'),
    description: text(
      'Workflow, task, dependency, artifact, handoff, approval, retry, and audit surfaces compose the canonical Workflow Runtime.',
      'تجمع أسطح سير العمل والمهام والتبعيات والقطع والتسليم والموافقة وإعادة المحاولة والتدقيق وقت تشغيل سير العمل القانوني.',
    ),
    requiredPermission: 'workflow:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Canonical workflow API', 'واجهة سير العمل القانونية'),
        'GET /workflows/:workflowId',
        'available',
      ),
      source(
        text('Task readiness', 'جاهزية المهام'),
        'GET /workflows/:workflowId/readiness',
        'available',
      ),
    ],
    sections: [
      section(
        text('Operational timeline', 'الخط الزمني التشغيلي'),
        text(
          'Status and retry controls only render after canonical workflow data confirms availability.',
          'تعرض عناصر التحكم في الحالة وإعادة المحاولة فقط بعد تأكيد بيانات سير العمل القانونية للتوفر.',
        ),
        [
          item('Tasks and dependencies', 'المهام والتبعيات'),
          item('Artifacts, handoffs, and approvals', 'القطع والتسليم والموافقات'),
          item(
            'Status, retries, and audit timeline',
            'الحالة وإعادة المحاولة والخط الزمني للتدقيق',
          ),
        ],
      ),
    ],
  },
  {
    id: 'ai-team',
    group: 'ai-platform',
    route: '/ai-team',
    label: text('AI Team', 'فريق الذكاء الاصطناعي'),
    title: text('AI Team', 'فريق الذكاء الاصطناعي'),
    description: text(
      'The canonical registry presents specialist agents, domain leaders, capabilities, tools, risk, and approval requirements.',
      'يعرض السجل القانوني الوكلاء المتخصصين وقادة النطاق والقدرات والأدوات والمخاطر ومتطلبات الموافقة.',
    ),
    requiredPermission: 'workflow:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(text('Canonical agent registry', 'سجل الوكلاء القانوني'), 'GET /agents', 'available'),
    ],
    sections: [
      section(
        text('Agent catalog', 'كتالوج الوكلاء'),
        text(
          'Marketing Commander remains the executive planner and the canonical Orchestrator remains the operational coordinator.',
          'يبقى قائد التسويق المخطط التنفيذي ويبقى المنسق القانوني المنسق التشغيلي.',
        ),
        [
          item('Specialists and domain leaders', 'المتخصصون وقادة النطاق'),
          item('Capabilities and allowed tools', 'القدرات والأدوات المسموحة'),
          item(
            'Approval requirements, risk, and enabled state',
            'متطلبات الموافقة والمخاطر وحالة التمكين',
          ),
        ],
      ),
    ],
  },
  {
    id: 'business-mentor',
    group: 'ai-platform',
    route: '/business-mentor',
    label: text('Business Mentor', 'المرشد التجاري'),
    title: text('Business Mentor', 'المرشد التجاري'),
    description: text(
      'An ADVISORY ONLY workspace for decision framing, rationale, lessons, missing context, and handoff requests.',
      'مساحة عمل استشارية فقط لتأطير القرار والتبرير والدروس والسياق المفقود وطلبات التسليم.',
    ),
    requiredPermission: 'tenant:read',
    approvalSensitivity: 'none',
    dataSources: [
      source(
        text('Business Mentor advisory service', 'خدمة المرشد التجاري الاستشارية'),
        'composition:business-mentor',
      ),
    ],
    sections: [
      section(
        text('Advisory guidance', 'إرشاد استشاري'),
        text(
          'Sensitive action execution controls are intentionally absent.',
          'عناصر التحكم في تنفيذ الإجراءات الحساسة غائبة عمداً.',
        ),
        [
          item('Daily priorities and decision framing', 'الأولويات اليومية وتأطير القرار'),
          item(
            'Rationale, expected impact, risks, and lesson',
            'التبرير والأثر المتوقع والمخاطر والدرس',
          ),
          item(
            'Missing context, handoffs, evidence, and confidence',
            'السياق المفقود والتسليم والأدلة والثقة',
          ),
        ],
      ),
    ],
  },
  {
    id: 'billing-usage',
    group: 'management',
    route: '/billing-usage',
    label: text('Billing & Usage', 'الفوترة والاستخدام'),
    title: text('Billing and usage', 'الفوترة والاستخدام'),
    description: text(
      'Subscription, plan, entitlements, usage, AI consumption, invoices, payment state, and permitted overrides remain source-aware.',
      'يبقى الاشتراك والخطة والاستحقاقات والاستخدام واستهلاك الذكاء الاصطناعي والفواتير وحالة الدفع والتجاوزات المسموح بها واعية بالمصدر.',
    ),
    requiredPermission: 'billing:admin',
    entitlement: 'billing-usage',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Billing and entitlement composition', 'تجميع الفوترة والاستحقاق'),
        'composition:billing-entitlements',
      ),
    ],
    sections: [
      section(
        text('Commercial control', 'التحكم التجاري'),
        text(
          'No checkout or payment success is presented without a canonical provider integration.',
          'لا يتم عرض نجاح الدفع أو إتمام الشراء دون تكامل مزود قانوني.',
        ),
        [
          item('Subscription, plan, and entitlements', 'الاشتراك والخطة والاستحقاقات'),
          item('Usage and AI request consumption', 'الاستخدام واستهلاك طلبات الذكاء الاصطناعي'),
          item(
            'Invoices, payment state, and permitted overrides',
            'الفواتير وحالة الدفع والتجاوزات المسموح بها',
          ),
        ],
      ),
    ],
  },
  {
    id: 'settings',
    group: 'management',
    route: '/settings',
    label: text('Settings', 'الإعدادات'),
    title: text('Tenant settings', 'إعدادات المستأجر'),
    description: text(
      'Tenant configuration is rendered only through canonical organization and integration composition endpoints.',
      'يتم عرض تكوين المستأجر فقط من خلال نقاط تجميع المنظمة والتكامل القانونية.',
    ),
    requiredPermission: 'organization:read',
    approvalSensitivity: 'read',
    dataSources: [
      source(
        text('Organization configuration', 'تكوين المنظمة'),
        'composition:organization-settings',
      ),
    ],
    sections: [
      section(
        text('Configuration', 'التكوين'),
        text(
          'Settings are permission-aware and do not create a second tenant model.',
          'الإعدادات واعية بالصلاحيات ولا تنشئ نموذج مستأجر ثانياً.',
        ),
        [
          item('Organization defaults and localization', 'إعدادات المنظمة واللغة'),
          item('Integrations and capability configuration', 'التكاملات وتكوين القدرات'),
          item('Security-aware account settings', 'إعدادات الحساب الواعية بالأمان'),
        ],
      ),
    ],
  },
  {
    id: 'admin-governance',
    group: 'management',
    route: '/admin-governance',
    label: text('Admin & Governance', 'الإدارة والحوكمة'),
    title: text('Admin and Governance', 'الإدارة والحوكمة'),
    description: text(
      'A governed administration console that consumes the canonical GovernanceService and never treats a feature flag as authorization.',
      'وحدة تحكم إدارية محكومة تستهلك GovernanceService القانوني ولا تعتبر علامة الميزة تفويضاً.',
    ),
    requiredPermission: 'organization:manage',
    approvalSensitivity: 'decision-required',
    dataSources: [
      source(
        text('Canonical governance service', 'خدمة الحوكمة القانونية'),
        'composition:governance',
      ),
    ],
    sections: [
      section(
        text('Organization controls', 'ضوابط المنظمة'),
        text(
          'Administrative access must be enforced by canonical server-side policy evaluation.',
          'يجب فرض الوصول الإداري من خلال تقييم السياسة القانوني من جانب الخادم.',
        ),
        [
          item(
            'Organizations, users, membership, roles, and permissions',
            'المنظمات والمستخدمون والعضوية والأدوار والصلاحيات',
          ),
          item(
            'Entitlements, usage, agents, prompts, models, and integrations',
            'الاستحقاقات والاستخدام والوكلاء والمطالبات والنماذج والتكاملات',
          ),
          item(
            'Audit, feature flags, retention, overrides, security, and system health',
            'التدقيق وعلامات الميزات والاحتفاظ والتجاوزات والأمان وصحة النظام',
          ),
        ],
      ),
      section(
        text('Data requests', 'طلبات البيانات'),
        text(
          'Deletion remains request → approval → execution state; no physical deletion control is implemented.',
          'يبقى الحذف طلب ← موافقة ← حالة تنفيذ؛ لا يتم تنفيذ تحكم حذف مادي.',
        ),
        [
          item('Data export requests', 'طلبات تصدير البيانات'),
          item('Data deletion requests and approval state', 'طلبات حذف البيانات وحالة الموافقة'),
          item('Feature flags never imply authorization', 'علامات الميزات لا تعني تفويضاً أبداً'),
        ],
      ),
    ],
  },
];

export function copy(value: LocalizedText, locale: ProductLocale): string {
  return locale === 'ar-SA' ? value.ar : value.en;
}

export function directionFor(locale: ProductLocale): ProductDirection {
  return locale === 'ar-SA' ? 'rtl' : 'ltr';
}

export function getProductView(id: string | undefined): ProductView | undefined {
  return productViews.find((view) => view.id === id);
}

/** One authenticated canonical API composition route for every product view. */
export function productSurfaceEndpoint(viewId: ProductViewId): string {
  return `/product-surfaces/${encodeURIComponent(viewId)}`;
}

export function assessProductAccess(view: ProductView, access: ProductAccess): ProductAccessState {
  if (access.tenantContext === 'missing') {
    return 'missing-context';
  }
  if (!access.permissions.includes(view.requiredPermission)) {
    return 'permission-denied';
  }
  if (view.entitlement && !access.entitlements.includes(view.entitlement)) {
    return 'entitlement-unavailable';
  }
  return 'available';
}

export const unavailableState = (view: ProductView): ProductDataState<never> => ({
  kind: 'unavailable',
  compositionEndpoint: productSurfaceEndpoint(view.id),
  message: text(
    'Canonical data composition is not available for this tenant session yet.',
    'تجميع البيانات القانوني غير متاح لجلسة المستأجر هذه بعد.',
  ),
});
