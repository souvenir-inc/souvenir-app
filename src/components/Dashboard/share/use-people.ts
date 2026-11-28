'use client'

import { useMemo } from 'react'
import { useAuth } from '@/context/auth-context'
import { useOrg, useOrgMembers } from '@/context/org-context'
import { People } from './share-model'

/** The organization's members, with the signed-in one as the viewer. */
export function usePeople(): People {
  const { user } = useAuth()
  const { org } = useOrg()
  const { members } = useOrgMembers()
  const viewer = user?.auth0Id ?? ''
  const workspace = org?.name ?? 'your workspace'
  return useMemo(() => new People(members, viewer, workspace), [members, viewer, workspace])
}
