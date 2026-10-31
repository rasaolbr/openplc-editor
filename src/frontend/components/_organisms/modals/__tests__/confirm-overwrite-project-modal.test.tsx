import { fireEvent, render, screen } from '@testing-library/react'

import type { OpenPLCStore } from '../../../../store'
import { createStoreWrapper, createTestStore } from '../../../../store/testing'
import { ConfirmOverwriteProjectModal } from '../confirm-overwrite-project-modal'

let store: OpenPLCStore
let answers: boolean[]

function openWith(projectPath: string) {
  store.getState().modalActions.openModal('confirm-overwrite-project', {
    projectPath,
    onResolve: (overwrite: boolean) => answers.push(overwrite),
  })
  render(<ConfirmOverwriteProjectModal />, { wrapper: createStoreWrapper(store) })
}

beforeEach(() => {
  store = createTestStore()
  answers = []
})

describe('ConfirmOverwriteProjectModal', () => {
  it('names the folder whose project would be replaced', () => {
    openWith('/projects/line-1')

    expect(screen.getByText('Replace the existing project?')).toBeTruthy()
    expect(screen.getByTestId('confirm-overwrite-project-path').textContent).toBe('/projects/line-1')
  })

  it('answers yes on Replace project and closes', () => {
    openWith('/projects/line-1')

    fireEvent.click(screen.getByRole('button', { name: 'Replace project' }))

    expect(answers).toEqual([true])
    expect(store.getState().modals['confirm-overwrite-project'].open).toBe(false)
  })

  it('answers no on Cancel and closes', () => {
    openWith('/projects/line-1')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(answers).toEqual([false])
    expect(store.getState().modals['confirm-overwrite-project'].open).toBe(false)
  })

  it('answers no on Escape', () => {
    openWith('/projects/line-1')

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(answers).toEqual([false])
  })
})
