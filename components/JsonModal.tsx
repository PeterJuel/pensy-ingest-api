// components/JsonModal.tsx
"use client";

interface JsonModalProps {
  /** The JSON object to render */
  body: any;
  /** Unique ID for this modal instance */
  modalId: string;
}

export default function JsonModal({ body, modalId }: JsonModalProps) {
  return (
    <>
      {/* Button to open modal */}
      <label htmlFor={modalId} className="btn btn-sm btn-outline">
        View Body
      </label>

      {/* Hidden checkbox that drives the modal */}
      <input type="checkbox" id={modalId} className="modal-toggle" />

      {/* Modal container */}
      <div className="modal">
        <div className="modal-box w-11/12 max-w-5xl">
          <h3 className="font-bold text-lg mb-4">Email Body (JSON)</h3>

          <div className="overflow-x-hidden max-w-full">
            <pre className="whitespace-pre-wrap break-words bg-base-100 p-4 rounded max-h-[60vh] overflow-y-auto">
              <code>{JSON.stringify(body, null, 2)}</code>
            </pre>
          </div>

          <div className="modal-action">
            {/* Label to close modal */}
            <label htmlFor={modalId} className="btn">
              Close
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
