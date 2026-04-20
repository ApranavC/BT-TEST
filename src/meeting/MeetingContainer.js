import React, { useState, useEffect, useRef, createRef, memo, useCallback } from "react";
import { Constants, useMeeting, useParticipant, usePubSub } from "@videosdk.live/react-sdk";
import { BottomBar } from "./components/BottomBar";
import { SidebarConatiner } from "../components/sidebar/SidebarContainer";
import MemorizedParticipantView from "./components/ParticipantView";
import { PresenterView } from "../components/PresenterView";
import { nameTructed, trimSnackBarText } from "../utils/helper";
import WaitingToJoinScreen from "../components/screens/WaitingToJoinScreen";
import ConfirmBox from "../components/ConfirmBox";
import useIsMobile from "../hooks/useIsMobile";
import useIsTab from "../hooks/useIsTab";
import { useMediaQuery } from "react-responsive";
import { toast } from "react-toastify";
import { useMeetingAppContext } from "../MeetingAppContextDef";

const ParticipantMicStream = memo(({ participantId }) => {
  const { micStream, isLocal } = useParticipant(participantId);

  useEffect(() => {
    if (!micStream) return;

    const mediaStream = new MediaStream();
    mediaStream.addTrack(micStream.track);

    const audioElement = new Audio();
    audioElement.srcObject = mediaStream;
    audioElement.muted = isLocal;
    audioElement.play().catch(() => {});

    return () => {
      audioElement.pause();
      audioElement.srcObject = null;
    };
  }, [micStream, isLocal, participantId]);

  return null;
});

const MeetingContent = React.memo(({
  containerHeight,
  bottomBarHeight,
  isMobile,
  sideBarContainerWidth,
}) => {
  const { presenterId, participants } = useMeeting();
  const isPresenting = presenterId ? true : false;

  const [participantsData, setParticipantsData] = useState([]);

  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      const participantIds = Array.from(participants.keys());
      setParticipantsData(participantIds);
    }, 500);

    return () => clearTimeout(debounceTimeout);
  }, [participants]);

  return (
    <>
      <div className={` flex flex-1 flex-row bg-gray-800 `}>
        <div className={`flex flex-1 `}>
          {isPresenting ? (
            <PresenterView height={containerHeight - bottomBarHeight} />
          ) : null}
          {isPresenting && isMobile ? (
            participantsData.map((participantId) => (
              <ParticipantMicStream key={participantId} participantId={participantId} />
            ))
          ) : (
            <MemorizedParticipantView isPresenting={isPresenting} />
          )}
        </div>

        <SidebarConatiner
          height={containerHeight - bottomBarHeight}
          sideBarContainerWidth={sideBarContainerWidth}
        />
      </div>
    </>
  );
});

export function MeetingContainer({
  onMeetingLeave,
  setIsMeetingLeft,
}) {
  const {
    setSelectedMic,
    setSelectedWebcam,
    setSelectedSpeaker,
    pendingHands,
    setPendingHands,
  } = useMeetingAppContext();

  const { useRaisedHandParticipants } = useMeetingAppContext();
  const pendingHandsRef = useRef(pendingHands);
  useEffect(() => {
    pendingHandsRef.current = pendingHands;
  }, [pendingHands]);
  const bottomBarHeight = 60;
  const localParticipantRef = useRef();

  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [localParticipantAllowedJoin, setLocalParticipantAllowedJoin] = useState(null);
  const [meetingErrorVisible, setMeetingErrorVisible] = useState(false);
  const [meetingError, setMeetingError] = useState(false);

  const containerRef = createRef();
  const containerHeightRef = useRef();
  const containerWidthRef = useRef();

  useEffect(() => {
    containerHeightRef.current = containerHeight;
    containerWidthRef.current = containerWidth;
  }, [containerHeight, containerWidth]);

  const isMobile = useIsMobile();
  const isTab = useIsTab();
  const isLGDesktop = useMediaQuery({ minWidth: 1024, maxWidth: 1439 });
  const isXLDesktop = useMediaQuery({ minWidth: 1440 });

  const sideBarContainerWidth = isXLDesktop
    ? 400
    : isLGDesktop
      ? 360
      : isTab
        ? 320
        : isMobile
          ? 280
          : 240;

  useEffect(() => {
    containerRef.current?.offsetHeight &&
      setContainerHeight(containerRef.current.offsetHeight);
    containerRef.current?.offsetWidth &&
      setContainerWidth(containerRef.current.offsetWidth);

    window.addEventListener("resize", ({ target }) => {
      containerRef.current?.offsetHeight &&
        setContainerHeight(containerRef.current.offsetHeight);
      containerRef.current?.offsetWidth &&
        setContainerWidth(containerRef.current.offsetWidth);
    });
  }, [containerRef]);

  const { participantRaisedHand } = useRaisedHandParticipants();

  const _handleMeetingLeft = () => {
    setIsMeetingLeft(true);
  };

  const _handleOnRecordingStateChanged = ({ status }) => {
    if (
      status === Constants.recordingEvents.RECORDING_STARTED ||
      status === Constants.recordingEvents.RECORDING_STOPPED
    ) {
      toast(
        `${status === Constants.recordingEvents.RECORDING_STARTED
          ? "Meeting recording is started"
          : "Meeting recording is stopped."
        }`,
        {
          position: "bottom-left",
          autoClose: 4000,
          hideProgressBar: true,
          closeButton: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "light",
        }
      );
    }
  };

  function onParticipantJoined(participant) {
    participant && participant.setQuality("high");
  }


  function onEntryResponded(participantId, name) {
    if (localParticipantRef.current?.id === participantId) {
      if (name === "allowed") {
        setLocalParticipantAllowedJoin(true);
      } else {
        setLocalParticipantAllowedJoin(false);
        setTimeout(() => {
          _handleMeetingLeft();
        }, 3000);
      }
    }
  }

  function onMeetingLeft() {
    setSelectedMic({ id: null, label: null })
    setSelectedWebcam({ id: null, label: null })
    setSelectedSpeaker({ id: null, label: null })
    onMeetingLeave();
  }

  const _handleOnError = (data) => {
    const { code, message } = data;

    const joiningErrCodes = [
      4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010,
    ];

    const isJoiningError = joiningErrCodes.findIndex((c) => c === code) !== -1;
    const isCriticalError = `${code}`.startsWith("500");

    new Audio(
      isCriticalError
        ? `https://static.videosdk.live/prebuilt/notification_critical_err.mp3`
        : `https://static.videosdk.live/prebuilt/notification_err.mp3`
    ).play();

    setMeetingErrorVisible(true);
    setMeetingError({
      code,
      message: isJoiningError ? "Unable to join meeting!" : message,
    });
  };

  const { isMeetingJoined, localParticipant } = useMeeting({
    onParticipantJoined,
    onEntryResponded,
    onMeetingStateChanged: ({state}) => {
      toast(`Meeting is in ${state} state`, {
        position: "bottom-left",
        autoClose: 4000,
        hideProgressBar: true,
        closeButton: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "light",
      });
    },
    onMeetingLeft,
    onError: _handleOnError,
    onRecordingStateChanged: _handleOnRecordingStateChanged,
  });

  useEffect(() => {
    localParticipantRef.current = localParticipant;
  }, [localParticipant]);

  usePubSub("RAISE_HAND", {
    onMessageReceived: (data) => {
      const localParticipantId = localParticipantRef.current?.id;

      const { senderId, senderName } = data;

      const isLocal = senderId === localParticipantId;

      new Audio(
        `https://static.videosdk.live/prebuilt/notification.mp3`
      ).play();

      toast(`${isLocal ? "You" : nameTructed(senderName, 15)} raised hand 🖐🏼`, {
        position: "bottom-left",
        autoClose: 4000,
        hideProgressBar: true,
        closeButton: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "light",
      });

      participantRaisedHand(senderId);
    },
  });

  usePubSub("CHAT", {
    onMessageReceived: (data) => {
      const localParticipantId = localParticipantRef.current?.id;

      const { senderId, senderName, message } = data;

      const isLocal = senderId === localParticipantId;

      if (!isLocal) {
        new Audio(
          `https://static.videosdk.live/prebuilt/notification.mp3`
        ).play();

        toast(
          `${trimSnackBarText(
            `${nameTructed(senderName, 15)} says: ${message}`
          )}`,
          {
            position: "bottom-left",
            autoClose: 4000,
            hideProgressBar: true,
            closeButton: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "light",
          }
        );
      }
    },
  });

  // --- Android interop: raiseHand / lowerHand / handResponse / removeFromStage ---

  usePubSub("raiseHand", {
    onMessageReceived: (data) => {
      const { senderId, senderName, message } = data;
      const localParticipantId = localParticipantRef.current?.id;
      if (senderId === localParticipantId) return;

      const studentId = message; // payload is the student's participant id
      setPendingHands((prev) => {
        if (prev.find((h) => h.participantId === studentId)) return prev;
        return [...prev, { participantId: studentId, senderName }];
      });

      new Audio(
        `https://static.videosdk.live/prebuilt/notification.mp3`
      ).play();

      toast(`${nameTructed(senderName, 15)} wants to join stage`, {
        position: "bottom-left",
        autoClose: 4000,
        hideProgressBar: true,
        closeButton: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "light",
      });
    },
  });

  usePubSub("lowerHand", {
    onMessageReceived: (data) => {
      const { message } = data;
      const studentId = message;
      setPendingHands((prev) =>
        prev.filter((h) => h.participantId !== studentId)
      );
    },
  });

  const { publish: publishHandResponse } = usePubSub("handResponse");
  const { publish: publishRemoveFromStage } = usePubSub("removeFromStage");

  const handleAccept = useCallback(
    (studentId) => {
      publishHandResponse(`accept:${studentId}`, { persist: false });
      setPendingHands((prev) =>
        prev.filter((h) => h.participantId !== studentId)
      );
    },
    [publishHandResponse, setPendingHands]
  );

  const handleReject = useCallback(
    (studentId) => {
      publishHandResponse(`reject:${studentId}`, { persist: false });
      setPendingHands((prev) =>
        prev.filter((h) => h.participantId !== studentId)
      );
    },
    [publishHandResponse, setPendingHands]
  );

  const handleRemoveFromStage = useCallback(
    (studentId) => {
      publishRemoveFromStage(studentId, { persist: false });
    },
    [publishRemoveFromStage]
  );

  return (
    <div className="fixed inset-0">
      <div ref={containerRef} className="h-full flex flex-col bg-gray-800">
        {typeof localParticipantAllowedJoin === "boolean" ? (
          localParticipantAllowedJoin ? (
            <>
              <MeetingContent
                containerHeight={containerHeight}
                bottomBarHeight={bottomBarHeight}
                isMobile={isMobile}
                sideBarContainerWidth={sideBarContainerWidth}
              />

              <BottomBar
                bottomBarHeight={bottomBarHeight}
                setIsMeetingLeft={setIsMeetingLeft}
              />
            </>
          ) : (
            <></>
          )
        ) : (
          !isMeetingJoined && <WaitingToJoinScreen />
        )}

        {/* Raise Hand Notification Popups */}
        {pendingHands.length > 0 && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "50vh",
              overflowY: "auto",
            }}
          >
            {pendingHands.map(({ participantId, senderName }) => (
              <div
                key={participantId}
                className="bg-gray-750 rounded-lg shadow-lg"
                style={{
                  padding: "12px 16px",
                  minWidth: 280,
                  border: "1px solid #ffffff20",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-sm font-semibold">
                    {nameTructed(senderName, 20)} wants to join stage
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-1.5 px-3 rounded text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                    onClick={() => handleAccept(participantId)}
                  >
                    Accept
                  </button>
                  <button
                    className="flex-1 py-1.5 px-3 rounded text-sm font-medium text-white bg-red-500 hover:bg-red-600"
                    onClick={() => handleReject(participantId)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmBox
          open={meetingErrorVisible}
          successText="OKAY"
          onSuccess={() => {
            setMeetingErrorVisible(false);
          }}
          title={`Error Code: ${meetingError.code}`}
          subTitle={meetingError.message}
        />
      </div>
    </div>
  );
}
