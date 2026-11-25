'use client'

import React, { useState } from 'react'
import { Checkbox } from '@/components/Checkbox'
import { useTheme } from '@/context/theme-context'

// ── Types ─────────────────────────────────────────────────────────────────────

type ThemeMode  = 'light' | 'dark' | 'system'

// ── Theme preview thumbnail ───────────────────────────────────────────────────

// The thumbnails show what each OPTION looks like in its own theme, so they must NOT follow
// the active theme. Keep these as named constants (not inline colours or tokens): tokens flip
// in dark mode, and inline hex literals get re-tokenised by scripts/migrate-inline-colors.mjs.
const FIXED = {
  page:     '#FFFFFF',
  hairline: '#F5F2EF',
  ink:      '#26211E',
  mid:      '#827A74',
  midRgb:   '130, 122, 116',
  darkBar:  '#3B3632',
} as const

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const isDark = mode === 'dark'
  return (
    <div style={{
      backgroundColor: FIXED.page,
      // The thumbnails below show what each OPTION looks like, so they use fixed
      // (light-theme) values — not tokens, which would flip when dark is active.
      border:          `1px solid ${isDark ? FIXED.ink : FIXED.hairline}`,
      borderRadius:    'var(--radius-xs)',
      height:          64,
      overflow:        'hidden',
      display:         'flex',
      flexDirection:   'column',
      flexShrink:      0,
      width:           '100%',
    }}>
      <div style={{ display: 'flex', flex: '1 0 0', minHeight: 0, overflow: 'hidden' }}>
        {/* Sidebar strip */}
        <div style={{
          backgroundColor: isDark ? FIXED.ink : 'white',
          display:         'flex',
          flexDirection:   'column',
          gap:             'var(--space-1)',
          paddingTop:      'var(--space-2)',
          paddingLeft:     'var(--space-1)',
          paddingRight:    'var(--space-1)',
          flexShrink:      0,
        }}>
          {[true, false, false, false].map((isActive, i) => (
            // eslint-disable-next-line react/no-array-index-key -- static fixed-length skeleton array, index is stable
            <div key={i} style={{
              height:          5,
              width:           24,
              borderRadius:    'var(--settings-preview-radius-sm)',
              backgroundColor: isDark
                ? isActive ? 'white' : FIXED.mid
                : isActive ? FIXED.ink : `rgba(${FIXED.midRgb}, 0.4)`,
            }} />
          ))}
        </div>
        {/* Main area */}
        <div style={{
          backgroundColor: isDark ? FIXED.ink : FIXED.page,
          flex:            '1 0 0',
          minWidth:        0,
          display:         'flex',
          flexDirection:   'column',
          gap:             'var(--settings-preview-gap-xs)',
          padding:         'var(--space-2)',
        }}>
          <div style={{
            height:          8,
            width:           50,
            borderRadius:    'var(--radius-xs)',
            backgroundColor: isDark ? FIXED.mid : `rgba(${FIXED.midRgb}, 0.3)`,
          }} />
          <div style={{
            height:          8,
            width:           70,
            borderRadius:    'var(--radius-xs)',
            backgroundColor: isDark ? FIXED.mid : `rgba(${FIXED.midRgb}, 0.2)`,
          }} />
          {/* Input bar */}
          <div style={{
            flex:            '1 0 0',
            minHeight:       0,
            backgroundColor: isDark ? FIXED.darkBar : 'white',
            borderRadius:    'var(--radius-sm)',
            display:         'flex',
            alignItems:      'center',
            paddingLeft:     'var(--space-1-5)',
            paddingRight:    'var(--space-1-5)',
          }}>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize: 'var(--font-size-small)',
              lineHeight: 'var(--line-height-small)',
              color:      isDark ? 'white' : FIXED.ink,
              opacity:    0.8,
              flex:       '1 0 0',
              minWidth:   0,
            }}>
              Souvenir
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
  { value: 'system', label: 'System' },
]

export default function PreferencesPage() {
  const theme = useTheme()
  const [localThemeMode,      setLocalThemeMode]      = useState<ThemeMode>('system')
  const themeMode    = theme.enabled ? theme.mode    : localThemeMode
  const setThemeMode = theme.enabled ? theme.setMode : setLocalThemeMode
  const [customInstructions,  setCustomInstructions]  = useState('')

  return (
    <div
      className="kaya-scrollbar"
      style={{
        flex:           '1 0 0',
        minHeight:      0,
        overflowY:      'auto',
        overflowX:      'hidden',
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'center',
        paddingTop:     'var(--space-10)',
        paddingBottom:  'var(--space-9)',
      }}
    >
      {/* Horizontal padding lives here, not on the scrolling element above —
          keeps the scrollbar flush with the container's edge. */}
      <div style={{ width: '100%', maxWidth: 908, padding: '0 var(--space-6)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)' }}>

        {/* ── Page header ── */}
        <div style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <h1 style={{
            fontFamily:   'var(--font-title)',
            fontWeight:   'var(--font-weight-regular)',
            fontSize:     'var(--font-size-heading)',
            lineHeight:   'var(--line-height-heading)',
            color:        'var(--neutral-900)',
            margin:       0,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            Preferences
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            color:      'var(--neutral-500)',
            margin:     0,
          }}>
            Personalize how Souvenir looks and how the AI communicates with you.
          </p>
        </div>

        {/* ── Screen mode card ── */}
        <div style={{
          border:       '1px solid var(--border-default)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow:    'var(--shadow-soft)',
          overflow:     'hidden',
        }}>
          <div style={{
            borderBottom: '1px solid var(--neutral-100)',
            padding:      'var(--space-3) var(--space-6) var(--space-6)',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-medium)',
              fontSize:   'var(--font-size-body-lg)',
              lineHeight: 'var(--line-height-body)',
              color:      'var(--neutral-900)',
              margin:     '0 0 var(--space-1-5)',
            }}>
              Screen mode
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize:   'var(--font-size-body)',
              lineHeight: 'var(--line-height-body)',
              color:      'var(--neutral-500)',
              margin:     0,
            }}>
              Choose how Souvenir looks. System follows your device setting.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-6)', padding: 'var(--space-3) var(--space-6)' }}>
            {THEME_OPTIONS.map(opt => {
              const selected = themeMode === opt.value
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- interactive div; keyboard handling delegated to inner elements
                <div
                  key={opt.value}
                  onClick={() => setThemeMode(opt.value)}
                  style={{
                    flex:            '1 0 0',
                    minWidth:        0,
                    display:         'flex',
                    flexDirection:   'column',
                    gap:             'var(--space-1-5)',
                    padding:         'var(--space-3)',
                    borderRadius:    'var(--radius-md)',
                    cursor:          'pointer',
                    position:        'relative',
                    backgroundColor: selected ? 'color-mix(in srgb, var(--neutral-100) 60%, transparent)' : 'var(--neutral-white)',
                    boxShadow:       selected
                      ? '0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px rgba(212, 212, 212,0.4), inset 0px 1px 0px 0px color-mix(in srgb, var(--static-white) 61%, transparent), inset 0px -1px 0px 0px rgba(106,98,93,0.05)'
                      : '0px 2px 2.8px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--neutral-100)',
                  }}
                >
                  <ThemePreview mode={opt.value} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => setThemeMode(opt.value)}
                    />
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 'var(--font-weight-regular)',
                      fontSize:   'var(--font-size-body)',
                      lineHeight: 'var(--line-height-body)',
                      color:      'var(--neutral-900)',
                      flex:       '1 0 0',
                      minWidth:   0,
                    }}>
                      {opt.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── AI instructions card (response style lives on Account; this was a
            second, unsaved tone picker and is gone) ── */}
        <div style={{
          border:       '1px solid var(--border-default)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow:    'var(--shadow-soft)',
          overflow:     'hidden',
        }}>
          {/* Header */}
          <div style={{
            borderBottom: '1px solid var(--neutral-100)',
            padding:      'var(--space-3) var(--space-6) var(--space-6)',
          }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-medium)',
              fontSize:   'var(--font-size-body-lg)',
              lineHeight: 'var(--line-height-body)',
              color:      'var(--neutral-900)',
              margin:     '0 0 var(--space-1-5)',
            }}>
              AI instructions
            </p>
            <p style={{
              fontFamily:   'var(--font-body)',
              fontWeight:   'var(--font-weight-regular)',
              fontSize:     'var(--font-size-body)',
              lineHeight:   'var(--line-height-body)',
              color:        'var(--neutral-500)',
              margin:       0,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              Extra guidance for every AI response. Your response style is set under Account.
            </p>
          </div>

          {/* Custom instructions */}
          <div style={{
            padding:       'var(--space-3) var(--space-6)',
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-medium)',
                fontSize:   'var(--font-size-body)',
                lineHeight: 'var(--line-height-body)',
                color:      'var(--neutral-900)',
                margin:     0,
              }}>
                Custom instructions
              </p>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-regular)',
                fontSize:   'var(--font-size-body)',
                lineHeight: 'var(--line-height-body)',
                color:      'var(--neutral-500)',
                margin:     0,
                flexShrink: 0,
              }}>
                {customInstructions.length}/500
              </p>
            </div>
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value.slice(0, 500))}
              placeholder={`e.g. "Always cite sources", "Keep responses under 200 words", "Use bullet points for lists"`}
              style={{
                width:           '100%',
                height:          96,
                resize:          'none',
                backgroundColor: 'var(--field-surface)',
                borderRadius:    'var(--radius-lg)',
                boxShadow:       '0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--neutral-100)',
                border:          'none',
                padding:         'var(--settings-preview-pill-padding)',
                fontFamily:      'var(--font-body)',
                fontWeight:      'var(--font-weight-regular)',
                fontSize:        'var(--font-size-body)',
                lineHeight:      'var(--line-height-body)',
                color:           'var(--neutral-600)',
                boxSizing:       'border-box',
                outline:         'none',
              }}
            />
            <p style={{
              fontFamily:   'var(--font-body)',
              fontWeight:   'var(--font-weight-regular)',
              fontSize:     'var(--font-size-body)',
              lineHeight:   'var(--line-height-body)',
              color:        'var(--neutral-500)',
              margin:       0,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              Set a default communication style for all AI responses. You can override this per agent or per chat.
            </p>
          </div>
        </div>

        {/* ── Souvenir's memory card ── */}
        <div style={{
          border:       '1px solid var(--border-default)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow:    'var(--shadow-soft)',
          overflow:     'hidden',
          padding:      'var(--space-3) var(--space-6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--settings-preview-gap-sm)' }}>
            {/* Left: title + description + badge */}
            <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 'var(--settings-preview-gap-sm)' }}>
              <div>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--font-weight-medium)',
                  fontSize:   'var(--font-size-body-lg)',
                  lineHeight: 'var(--line-height-body)',
                  color:      'var(--neutral-900)',
                  margin:     '0 0 var(--space-1-5)',
                  overflow:   'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  Souvenir's memory
                </p>
                <p style={{
                  fontFamily:   'var(--font-body)',
                  fontWeight:   'var(--font-weight-regular)',
                  fontSize:     'var(--font-size-body)',
                  lineHeight:   'var(--line-height-body)',
                  color:        'var(--neutral-500)',
                  margin:       0,
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  Memory is active. Souvenir is learning from your conversations and retaining context across sessions.
                </p>
              </div>

              {/* Green "Active" badge */}
              <div style={{
                display:         'inline-flex',
                alignItems:      'center',
                justifyContent:  'center',
                padding:         'var(--space-0-5)',
                borderRadius:    'var(--radius-sm)',
                backgroundColor: 'var(--green-50)',
                boxShadow:       'var(--color-tag-Green-shadow), var(--color-tag-Green-inner-shadow)',
                alignSelf:       'flex-start',
              }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--font-weight-medium)',
                  fontSize: 'var(--font-size-small)',
                  lineHeight: 'var(--line-height-small)',
                  color:      'var(--green-800)',
                  padding:    '0 var(--space-0-5)',
                  whiteSpace: 'nowrap',
                }}>
                  Active - 12 memories saved
                </span>
              </div>
            </div>

            {/* Manage memory button */}
            <button
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                justifyContent:  'center',
                padding:         'var(--space-1-5) var(--space-2-5) var(--space-2)',
                borderRadius:    'var(--radius-lg)',
                border:          'none',
                cursor:          'pointer',
                backgroundColor: 'var(--field-surface)',
                boxShadow:       '0px 1.091px 1.091px 0px rgba(59,54,50,0.05), 0px 1.455px 3.127px 0px rgba(38,33,30,0.15), 0px 0px 0px 1px var(--neutral-100), inset 0px -2.182px 0.364px 0px var(--neutral-100)',
                fontFamily:      'var(--font-body)',
                fontWeight:      'var(--font-weight-medium)',
                fontSize:        'var(--font-size-body)',
                lineHeight:      'var(--line-height-body)',
                color:           'var(--neutral-700)',
                whiteSpace:      'nowrap',
                flexShrink:      0,
              }}
            >
              Manage memory
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
