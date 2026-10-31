/**
 * Save As into a folder that already holds an OpenPLC project.
 *
 * The Save As flow is waiting on `onResolve`: the replace button answers `true`, every other way out `false`. A close
 * from outside this dialog is caught by the flow itself, which watches the modal state.
 */

import { WarningIcon } from '../../../assets/icons/interface/Warning'
import { useOpenPLCStore } from '../../../store'
import type { ConfirmOverwriteProjectModalData } from '../../../store/slices/modal'
import { Modal, ModalContent } from '../../_molecules/modal'

function isModalData(data: unknown): data is ConfirmOverwriteProjectModalData {
  if (typeof data !== 'object' || data === null) return false
  return (
    'projectPath' in data &&
    typeof data.projectPath === 'string' &&
    'onResolve' in data &&
    typeof data.onResolve === 'function'
  )
}

const ConfirmOverwriteProjectModal = () => {
  const { modals, modalActions } = useOpenPLCStore()
  const state = modals['confirm-overwrite-project']
  const isOpen = state?.open || false
  const data = isModalData(state?.data) ? state.data : undefined

  const answer = (overwrite: boolean) => {
    data?.onResolve(overwrite)
    modalActions.onOpenChange('confirm-overwrite-project', false)
  }

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && answer(false)}>
      <ModalContent className='flex w-[400px] select-none flex-col items-center justify-evenly rounded-lg'>
        <div className='flex select-none flex-col items-center gap-5'>
          <WarningIcon className='mt-2 h-[73px] w-[73px]' />
          <div className='flex flex-col gap-2 px-4'>
            <p className='text-m w-full text-center font-bold text-gray-600 dark:text-neutral-100'>
              Replace the existing project?
            </p>
            <p className='w-full text-center text-xs text-gray-500 dark:text-neutral-400'>
              This folder already contains an OpenPLC project:
            </p>
            <p
              data-testid='confirm-overwrite-project-path'
              className='w-full break-all text-center text-xs font-medium text-gray-600 dark:text-neutral-300'
            >
              {data?.projectPath}
            </p>
            <p className='w-full text-center text-xs text-gray-500 dark:text-neutral-400'>
              Its POUs, data types and devices will be replaced by the current project. Other files in the folder are
              kept. This cannot be undone.
            </p>
          </div>
          <div className='flex w-[260px] flex-col gap-1 space-y-2 text-sm'>
            <button
              type='button'
              onClick={() => answer(true)}
              className='w-full rounded-lg bg-brand px-4 py-2 text-center font-medium text-white hover:bg-brand-medium-dark'
            >
              Replace project
            </button>
            <button
              type='button'
              onClick={() => answer(false)}
              className='w-full rounded-md bg-neutral-100 px-4 py-2 font-medium hover:bg-neutral-200 dark:bg-neutral-850 dark:text-neutral-100 dark:hover:bg-neutral-800'
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}

export { ConfirmOverwriteProjectModal }
