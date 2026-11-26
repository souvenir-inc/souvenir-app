'use client'

import React from 'react'
import type { WorkspaceConnector } from '@/types/teams'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/ui/button'

export interface WorkspaceConnectorCardProps {
  connector: WorkspaceConnector
  isAdmin:   boolean
  onManage?: () => void
  onRevoke?: () => void
}

const STATUS_CONFIG: Record<WorkspaceConnector['status'], { label: string; color: 'Green' | 'Neutral' | 'Yellow' | 'Red' }> = {
  connected:        { label: 'Connected',     color: 'Green'   },
  not_connected:    { label: 'Not connected', color: 'Neutral' },
  auth_in_progress: { label: 'Connecting…',  color: 'Yellow'  },
  auth_failed:      { label: 'Auth failed',  color: 'Red'     },
}

export function WorkspaceConnectorCard({ connector, isAdmin, onManage, onRevoke }: WorkspaceConnectorCardProps) {
  const statusCfg = STATUS_CONFIG[connector.status]

  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      gap:             'var(--space-3)',
      padding:         'var(--space-2-5) var(--space-4)',
      backgroundColor: 'var(--neutral-white)',
      borderRadius:    'var(--radius-xl)',
      boxShadow:       'var(--workspace-connector-card-shadow)',
    }}>
      {/* Icon */}
      <div style={{
        width:           36,
        height:          36,
        borderRadius:    'var(--radius-md)',
        backgroundColor: 'var(--neutral-100)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        flexShrink:      0,
        fontFamily:      'var(--font-body)',
        fontWeight:      'var(--font-weight-semibold)',
        fontSize:        'var(--font-size-body)',
        color:           'var(--neutral-600)',
      }}>
        {connector.name.charAt(0)}
      </div>

      {/* Name + connected-by */}
      <div style={{ flex: '1 0 0', minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-medium)',
          fontSize:   'var(--font-size-body)',
          lineHeight: 'var(--line-height-body)',
          color:      'var(--neutral-900)',
          margin:     0,
          overflow:   'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {connector.name}
        </p>
        {connector.connectedBy && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-small)',
            lineHeight: 'var(--line-height-small)',
            color:      'var(--neutral-400)',
            margin:     0,
          }}>
            by {connector.connectedBy}
          </p>
        )}
      </div>

      {/* Status badge */}
      <Badge label={statusCfg.label} color={statusCfg.color} />

      {/* Admin actions */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 'var(--space-1-5)', flexShrink: 0 }}>
          {connector.status === 'connected' && onRevoke && (
            <Button variant="danger" size="sm" onClick={onRevoke}>
              Revoke
            </Button>
          )}
          {(connector.status === 'not_connected' || connector.status === 'auth_failed') && onManage && (
            <Button variant="default" size="sm" onClick={onManage}>
              {connector.status === 'auth_failed' ? 'Retry' : 'Connect'}
            </Button>
          )}
          {connector.status === 'connected' && onManage && (
            <Button variant="secondary" size="sm" onClick={onManage}>
              Manage
            </Button>
          )}
          {connector.status === 'auth_in_progress' && (
            <Button variant="secondary" size="sm" disabled>
              Connecting…
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

WorkspaceConnectorCard.displayName = 'WorkspaceConnectorCard'
export default WorkspaceConnectorCard
