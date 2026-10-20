import { Bot, BriefcaseBusiness, CircleDollarSign, Gavel, LayoutDashboard, Settings2 } from 'lucide-react'

export const primaryNavigation = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Jobs', to: '/jobs', icon: BriefcaseBusiness },
  { label: 'Escrow', to: '/escrow', icon: CircleDollarSign },
  { label: 'Disputes', to: '/disputes', icon: Gavel },
] as const

export const secondaryNavigation = [
  { label: 'Configuration', to: '/settings', icon: Settings2 },
] as const
