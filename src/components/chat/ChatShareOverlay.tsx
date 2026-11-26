'use client'

import { ShareOneIcon, CancelOneIcon, SidebarRightIcon } from '@strange-huge/icons'
import { usePathname } from 'next/navigation'
import { useOpenChatPanel } from '@/hooks/use-open-chat-panel'
import { Avatar } from '@/components/Avatar'
import { Checkbox } from '@/components/Checkbox'
import { Button, IconButton } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/Tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { trackFeature } from '@/lib/analytics/events'
import { TopBarPortal } from '@/components/layout/TopBarSlots'

// ── Top-right chat overlay: Share button + modal for chat owners, ──────────
// "Create a copy" button for viewers of a chat shared/published to them. ────
// One card, two tabs: Share (multiselect workspace member list) and Active
// shares (revoke list).
// Standalone chat sharing is person-to-person only — the backend dropped
// project/team targets and the editable/read-only mode entirely (migration
// c8d1e4f7a2b5): in-project chats inherit the whole project as their
// audience via a separate mechanism (POST /chats/{id}/share), and every
// standalone share is now uniformly "view read-only, then optionally fork
// your own copy" — there's nothing left to toggle for either dimension.

interface ChatShareOverlayProps {
  chatId:    string | undefined
  /** True when the current user owns this chat and may manage its shares. */
  canManage: boolean
  /** True when this chat was shared/published to the current user (not owned by them),
   *  OR when it's archived — an owned-but-archived chat is folded into the same
   *  read-only treatment (see the `readOnly` computation in chat/page.tsx). */
  readOnly:  boolean
  onCopied:  (copy: { chatId: string; chatTitle: string }) => void
  /** Opens the share modal as soon as `chatId`/`canManage` are ready — e.g. a
   *  `?share=1` deep link from the sidebar's "Share" menu item. Fires once per
   *  value change, not on every render (see the effect below), so closing the
   *  modal doesn't cause it to reopen on an unrelated re-render. */
  autoOpen?: boolean
}

type ChatShareTab = 'share' | 'manage'

// Modal height is fixed (matching the one other tabbed dialog in this
// codebase, SuperLinkDrawer) rather than left to size to content — the
// Share tab (a scrollable member list) and Active shares tab (an empty state
// or a list) have different natural heights, so letting the card free-size
// would make it visibly resize on every tab switch. Both tabs' lists scroll
// internally past this via their own `overflowY: auto`.
const MODAL_HEIGHT = 640

import { useChatShare } from './use-chat-share'

export function ChatShareOverlay({ chatId, canManage, readOnly, onCopied, autoOpen }: ChatShareOverlayProps) {
  const { orgId, chatShareOpen, setChatShareOpen, activeTab, setActiveTab, existingShares, sharesLoading, revokingShareId, selectedIds, creatingShare, copyingChat, handleOpenChatShare, toggleSelected, handleCreateShare, handleRevokeShare, handleCopyReadableChat, shareableMembers, memberRowStyle } = useChatShare({ chatId, canManage, onCopied, autoOpen })

  // The chat panel (Context · Browser · Agents) toggle shares this row, right of Share, so the two
  // stay level with the chat-name chip on the left (TopBar).
  const inProject = usePathname().startsWith('/project/')
  const chatPanel = useOpenChatPanel({ inProject, agentsDisabled: readOnly })

  return (
    <>
      {/* Share and the side panel toggle, at the right end of the TopBar. */}
      <TopBarPortal side="right">
      {chatId && canManage && !!orgId && (
        // With the side panel open the chat column is narrower, so Share drops to its icon.
        chatPanel.isOpen ? (
          <IconButton
            variant="default"
            size="sm"
            aria-label="Share chat"
            title="Share"
            icon={<ShareOneIcon size={18} animated />}
            onClick={() => { trackFeature('share_button', { surface: 'chat' }); handleOpenChatShare() }}
          />
        ) : (
          <Button
            variant="default"
            size="sm"
            aria-label="Share chat"
            leftIcon={<ShareOneIcon animated />}
            onClick={() => { trackFeature('share_button', { surface: 'chat' }); handleOpenChatShare() }}
          >
            Share
          </Button>
        )
      )}
      {chatId && readOnly && (
          <Button variant="secondary" size="sm" loading={copyingChat} onClick={() => void handleCopyReadableChat()}>
            Create a copy
          </Button>
      )}
        <IconButton
          variant="outline"
          size="sm"
          aria-label={chatPanel.isOpen ? 'Close side panel' : 'Open side panel'}
          aria-expanded={chatPanel.isOpen}
          title={chatPanel.isOpen ? 'Close side panel' : 'Context, browser and agents'}
          active={chatPanel.isOpen}
          icon={<SidebarRightIcon size={18} />}
          onClick={chatPanel.toggle}
        />
      </TopBarPortal>

      <Dialog open={chatShareOpen} onOpenChange={setChatShareOpen}>
        <DialogContent
          hideClose
          aria-describedby={undefined}          style={{
            background:    'var(--modal-bg)',
            borderRadius:  'var(--radius-2xl)',
            boxShadow:     'var(--shadow-4)',
            width:         '560px',
            maxWidth:      'calc(100vw - 32px)',
            height:        MODAL_HEIGHT,
            maxHeight:     'calc(100vh - 64px)',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}
        >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-5) var(--space-5) var(--space-4)', flexShrink: 0 }}>
                <DialogTitle style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--legacy-1a1714)', margin: 0 }}>
                  Share chat
                </DialogTitle>
                <IconButton variant="ghost" size="xs" icon={<CancelOneIcon />} aria-label="Close" onClick={() => setChatShareOpen(false)} />
              </div>

              <div style={{ height: '1px', background: 'var(--neutral-100)', flexShrink: 0 }} />

              <Tabs
                value={activeTab}
                onValueChange={(v: string) => setActiveTab(v as ChatShareTab)}
                style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0 }}
              >
                <div style={{ padding: 'var(--space-4) var(--space-5) 0', flexShrink: 0 }}>
                  <TabsList size="small">
                    <TabsTrigger value="share">Share</TabsTrigger>
                    <TabsTrigger value="manage" count={existingShares.length > 0 ? existingShares.length : undefined}>Active shares</TabsTrigger>
                  </TabsList>
                </div>

                {/* ── Share tab — multiselect everyone in the workspace who
                    doesn't already have an active share of this chat ── */}
                <TabsContent
                  value="share"
                  style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, paddingTop: 'var(--space-4)' }}
                >
                  {/* Person-to-person only — the backend dropped both the
                      project/team target and the editable/read-only mode
                      (see the file header comment). Viewing is always
                      read-only-in-place; the recipient can always fork
                      their own copy from there, so there's nothing left
                      to pick beyond who to share with. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '0 var(--space-5)', flexShrink: 0 }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', color: 'var(--neutral-900)', margin: 0 }}>
                      Share with
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-500)', margin: '0 0 var(--space-2)' }}>
                      They can view this chat and make their own copy of it.
                    </p>
                  </div>

                  <div
                    className="kaya-scrollbar"
                    style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 var(--space-5) var(--space-5)' }}
                  >
                    {/* padding: 3 — same convention as ProjectMembersPanel/
                        ProjectAddMembersList's own scrollable row lists: gives
                        the selected row's box-shadow ring room to breathe so
                        it doesn't get clipped at the scroll container's edges
                        (most visibly the top row, flush against the top). */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', padding: 'var(--space-0-5)' }}>
                      {sharesLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} aria-hidden style={memberRowStyle}>
                            <div className="kaya-skeleton" style={{ width: 16, height: 16, borderRadius: 'var(--radius-xs)', flexShrink: 0 }} />
                            <div className="kaya-skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', flex: 1 }}>
                              <div className="kaya-skeleton" style={{ height: 13, width: '45%', borderRadius: 'var(--radius-sm)' }} />
                              <div className="kaya-skeleton" style={{ height: 11, width: '65%', borderRadius: 'var(--radius-sm)' }} />
                            </div>
                          </div>
                        ))
                      ) : shareableMembers.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-7) var(--space-2)', textAlign: 'center' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-xl)', background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShareOneIcon size={20} color="var(--neutral-400)" />
                          </div>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-600)', margin: 0 }}>
                            Everyone in the workspace already has this chat shared with them.
                          </p>
                        </div>
                      ) : (
                        shareableMembers.map(member => {
                          const checked = selectedIds.has(member.id)
                          return (
                            // A div, not a button: the Checkbox is itself a button, and a button inside a button both
                            // breaks HTML and fired the toggle twice, so a click on the box changed nothing.
                            <div
                              key={member.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={checked}
                              onClick={() => toggleSelected(member.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelected(member.id) } }}
                              style={{
                                ...memberRowStyle,
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: checked ? 'var(--blue-50)' : 'var(--neutral-white)',
                                boxShadow: checked
                                  ? '0px 0px 0px 1px var(--blue-300)'
                                  : 'var(--shadow-control)',
                              }}
                            >
                              <Checkbox checked={checked} tabIndex={-1} onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggleSelected(member.id)} />
                              <Avatar name={member.name || member.email} size="sm" />
                              <div style={{ minWidth: 0, flex: '1 0 0', textAlign: 'left' }}>
                                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-800)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {member.name || member.email}
                                </p>
                                {member.name && member.email && (
                                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)', margin: 'var(--space-0-5) 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {member.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── Active shares tab — manage / revoke ── */}
                <TabsContent
                  value="manage"
                  className="kaya-scrollbar"
                  style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-5)' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: '0 var(--space-5)' }}>
                    {sharesLoading ? (
                      [0, 1].map(i => (
                        <div
                          key={i}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: 'var(--space-2-5) var(--space-3)', borderRadius: 'var(--radius-lg)',
                            backgroundColor: 'var(--neutral-50)', boxShadow: '0px 0px 0px 1px var(--neutral-100)',
                            gap: 'var(--space-2)', opacity: 1 - i * 0.25,
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <div className="kaya-skeleton" style={{ width: 110, height: 13, borderRadius: 'var(--radius-xs)' }} />
                            <div className="kaya-skeleton" style={{ width: 140, height: 11, borderRadius: 'var(--radius-xs)' }} />
                          </div>
                          <div className="kaya-skeleton" style={{ width: 64, height: 28, borderRadius: 'var(--radius-md)' }} />
                        </div>
                      ))
                    ) : existingShares.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-7) var(--space-2)', textAlign: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-xl)', background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ShareOneIcon size={20} color="var(--neutral-400)" />
                        </div>
                        <div>
                          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-700)', margin: 0 }}>
                            No active shares
                          </p>
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)', margin: 'var(--space-1) 0 0' }}>
                            Use the Share tab to share this chat with a person or project.
                          </p>
                        </div>
                      </div>
                    ) : (
                      existingShares.map(share => {
                        const label = share.targetUserName || share.targetUserEmail || 'Person'
                        const isRevoking = revokingShareId === share.id
                        return (
                          <div
                            key={share.id}
                            style={{
                              display:         'flex',
                              alignItems:      'center',
                              justifyContent:  'space-between',
                              padding:         'var(--space-2-5) var(--space-3)',
                              borderRadius:    'var(--radius-lg)',
                              backgroundColor: 'var(--neutral-50)',
                              boxShadow:       '0px 0px 0px 1px var(--neutral-100)',
                              gap:             'var(--space-2)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-800)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {label}
                              </p>
                              {share.targetUserName && share.targetUserEmail && (
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-600)', margin: 'var(--space-0-5) 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {share.targetUserEmail}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              loading={isRevoking}
                              disabled={isRevoking}
                              onClick={() => void handleRevokeShare(share.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div style={{ height: '1px', background: 'var(--neutral-100)', flexShrink: 0 }} />

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-5)', flexShrink: 0 }}>
                <Button variant="ghost" onClick={() => setChatShareOpen(false)}>
                  {activeTab === 'share' ? 'Cancel' : 'Close'}
                </Button>
                {activeTab === 'share' && (
                  <Button variant="secondary" size="sm" loading={creatingShare} disabled={selectedIds.size === 0 || creatingShare} onClick={() => void handleCreateShare()}>
                    {selectedIds.size > 1 ? `Share (${selectedIds.size})` : 'Share'}
                  </Button>
                )}
              </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
