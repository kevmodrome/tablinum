export interface RemovedInfo {
  epochId: string;
  removedBy: string;
}

class DbUiState {
  joinedViaInvite = $state(false);
  removed = $state<RemovedInfo | null>(null);

  reset(joinedViaInvite: boolean): void {
    this.joinedViaInvite = joinedViaInvite;
    this.removed = null;
  }

  markRemoved(info: RemovedInfo): void {
    this.removed = info;
  }
}

export const dbUiState = new DbUiState();
