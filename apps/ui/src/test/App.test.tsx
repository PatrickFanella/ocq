import { render, screen } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { App } from '../App'

it('renders ops console navigation', () => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  })

  try {
    render(<App />)

    expect(screen.getByText('ops console')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sessions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  } finally {
    vi.unstubAllGlobals()
  }
})
