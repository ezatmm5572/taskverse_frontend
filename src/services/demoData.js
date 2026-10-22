export const demoUser = {
  _id: 'usr_demo_101',
  fname: 'Alex',
  lname: 'Vance',
  email: 'alex.vance@taskverse.io',
  role: 'admin',
  gender: 'male',
  confirmed: true,
  createdAt: '2026-01-15T09:00:00.000Z'
}

export const demoTeams = [
  {
    _id: 'team_core_1',
    name: 'Core Platform & Architecture',
    addedBy: 'usr_demo_101',
    teamAdmins: ['usr_demo_101'],
    teamMembers: [
      { _id: 'usr_demo_101', fname: 'Alex', lname: 'Vance', email: 'alex.vance@taskverse.io' },
      { _id: 'usr_demo_102', fname: 'Elena', lname: 'Rostova', email: 'elena.r@taskverse.io' },
      { _id: 'usr_demo_103', fname: 'Marcus', lname: 'Chen', email: 'marcus.c@taskverse.io' }
    ],
    createdAt: '2026-02-01T10:00:00.000Z'
  },
  {
    _id: 'team_ui_2',
    name: 'Glassmorphic Design Systems',
    addedBy: 'usr_demo_101',
    teamAdmins: ['usr_demo_101', 'usr_demo_102'],
    teamMembers: [
      { _id: 'usr_demo_101', fname: 'Alex', lname: 'Vance', email: 'alex.vance@taskverse.io' },
      { _id: 'usr_demo_104', fname: 'Sophia', lname: 'Taylor', email: 'sophia.t@taskverse.io' },
      { _id: 'usr_demo_105', fname: 'David', lname: 'Kim', email: 'david.k@taskverse.io' }
    ],
    createdAt: '2026-02-10T14:30:00.000Z'
  },
  {
    _id: 'team_growth_3',
    name: 'Product Growth & Marketing',
    addedBy: 'usr_demo_101',
    teamAdmins: ['usr_demo_101'],
    teamMembers: [
      { _id: 'usr_demo_101', fname: 'Alex', lname: 'Vance', email: 'alex.vance@taskverse.io' },
      { _id: 'usr_demo_103', fname: 'Marcus', lname: 'Chen', email: 'marcus.c@taskverse.io' }
    ],
    createdAt: '2026-03-01T11:15:00.000Z'
  }
]

export const demoMembers = [
  { _id: 'usr_demo_101', fname: 'Alex', lname: 'Vance', email: 'alex.vance@taskverse.io', role: 'admin', confirmed: true },
  { _id: 'usr_demo_102', fname: 'Elena', lname: 'Rostova', email: 'elena.r@taskverse.io', role: 'member', confirmed: true },
  { _id: 'usr_demo_103', fname: 'Marcus', lname: 'Chen', email: 'marcus.c@taskverse.io', role: 'member', confirmed: true },
  { _id: 'usr_demo_104', fname: 'Sophia', lname: 'Taylor', email: 'sophia.t@taskverse.io', role: 'member', confirmed: false },
  { _id: 'usr_demo_105', fname: 'David', lname: 'Kim', email: 'david.k@taskverse.io', role: 'member', confirmed: true }
]

export const demoTasks = [
  {
    _id: 'task_001',
    title: 'Design Liquid Glass UI Components',
    description: 'Craft frosted glass cards, glow borders, and translucent inputs with CSS backdrop-filter.',
    startDate: '2026-10-18T00:00:00.000Z',
    endDate: '2026-10-25T00:00:00.000Z',
    team: { _id: 'team_ui_2', name: 'Glassmorphic Design Systems' },
    status: 'inProgress',
    myAssignment: { _id: 'asg_001', status: 'inProgress' }
  },
  {
    _id: 'task_002',
    title: 'Dark & Light Mode Color Scheme Switcher',
    description: 'Integrate seamless tri-state switcher with local storage persistence and system preference detection.',
    startDate: '2026-10-19T00:00:00.000Z',
    endDate: '2026-10-24T00:00:00.000Z',
    team: { _id: 'team_ui_2', name: 'Glassmorphic Design Systems' },
    status: 'complete',
    myAssignment: { _id: 'asg_002', status: 'complete' }
  },
  {
    _id: 'task_003',
    title: 'Redis Caching & Session Token Management',
    description: 'Optimize token blacklist and query cache invalidation via Upstash Redis pipeline.',
    startDate: '2026-10-12T00:00:00.000Z',
    endDate: '2026-10-20T00:00:00.000Z',
    team: { _id: 'team_core_1', name: 'Core Platform & Architecture' },
    status: 'complete',
    myAssignment: { _id: 'asg_003', status: 'complete' }
  },
  {
    _id: 'task_004',
    title: 'Hardware-Accelerated Aurora Motion & Keyframes',
    description: 'Implement floating ambient aurora orbs and compositor-friendly entrance animations.',
    startDate: '2026-10-21T00:00:00.000Z',
    endDate: '2026-10-27T00:00:00.000Z',
    team: { _id: 'team_ui_2', name: 'Glassmorphic Design Systems' },
    status: 'inProgress',
    myAssignment: { _id: 'asg_004', status: 'inProgress' }
  },
  {
    _id: 'task_005',
    title: 'Multi-device Session Revocation & Security Audit',
    description: 'Verify JWT refresh token rotation and all-device logout endpoints with rate limiting.',
    startDate: '2026-10-15T00:00:00.000Z',
    endDate: '2026-10-21T00:00:00.000Z',
    team: { _id: 'team_core_1', name: 'Core Platform & Architecture' },
    status: 'fail',
    myAssignment: { _id: 'asg_005', status: 'fail' }
  },
  {
    _id: 'task_006',
    title: 'Customer Onboarding & Team Invitation Funnel',
    description: 'Automate nodemailer invitation emails with HTML preview templates and sign-in links.',
    startDate: '2026-10-20T00:00:00.000Z',
    endDate: '2026-10-30T00:00:00.000Z',
    team: { _id: 'team_growth_3', name: 'Product Growth & Marketing' },
    status: 'to-do',
    myAssignment: null
  }
]

export const demoAssignments = [
  {
    _id: 'asg_001',
    status: 'inProgress',
    task: demoTasks[0]
  },
  {
    _id: 'asg_002',
    status: 'complete',
    task: demoTasks[1]
  },
  {
    _id: 'asg_003',
    status: 'complete',
    task: demoTasks[2]
  },
  {
    _id: 'asg_004',
    status: 'inProgress',
    task: demoTasks[3]
  },
  {
    _id: 'asg_005',
    status: 'fail',
    task: demoTasks[4]
  }
]
