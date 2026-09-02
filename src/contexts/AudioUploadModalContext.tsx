import React, { createContext, useContext, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioUploadDialog } from "@/components/AudioUploadDialog";
import { useAccount } from "@/contexts/AccountContext";

interface AudioUploadModalContextType {
  isOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
  setIsOpen: (open: boolean) => void;
}

const AudioUploadModalContext = createContext<AudioUploadModalContextType | undefined>(undefined);

export function AudioUploadModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { currentAccount } = useAccount();
  const accountId = currentAccount?.account_id;

  const openUploadModal = () => setIsOpen(true);
  const closeUploadModal = () => setIsOpen(false);

  const handleUploadComplete = () => {
    if (accountId) {
      queryClient.invalidateQueries({ queryKey: ["audio-files", accountId] });
      queryClient.invalidateQueries({ queryKey: ["biblioteca-extractions", accountId] });
    }
    queryClient.invalidateQueries({ queryKey: ["audio-files"] });
    queryClient.invalidateQueries({ queryKey: ["biblioteca-extractions"] });
  };

  return (
    <AudioUploadModalContext.Provider
      value={{
        isOpen,
        openUploadModal,
        closeUploadModal,
        setIsOpen,
      }}
    >
      {children}
      <AudioUploadDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onUploadComplete={handleUploadComplete}
      />
    </AudioUploadModalContext.Provider>
  );
}

export function useAudioUploadModal() {
  const context = useContext(AudioUploadModalContext);
  if (!context) {
    throw new Error("useAudioUploadModal must be used within an AudioUploadModalProvider");
  }
  return context;
}
