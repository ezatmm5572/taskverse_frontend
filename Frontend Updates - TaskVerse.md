# Frontend Updates – TaskVerse

## 1. Show How Many Team Members Completed the Assignment

### Requirement
Update the task and team assignment interface to clearly display how many assigned team members have completed the task.

### Expected Behavior
- Display the completion count on the relevant task card or assignment details.
- Use the format: **Completed X / Y members**.
  - `X` is the number of assigned members whose task status indicates completion, based on the statuses defined by the backend.
  - `Y` is the total number of members assigned to the task.
- Update the count whenever assignments or individual task statuses change.
- Handle tasks with no assigned members gracefully, such as displaying `0 / 0`.
- Count only members assigned to that specific task.

### Implementation Notes
- Use the existing backend response and status definitions. Do not introduce new status values.
- If the API does not provide enough information to calculate the count accurately, identify the missing fields and request the necessary API update instead of relying on incomplete frontend data.

## 2. Fix the Task Card and Allow Users to Select the Task Progress Status

### Requirement
Fix the task card UI and provide a way for authorized users to select and update the task progress status.

### Expected Behavior
- Fix the task card layout and ensure that its information and actions are displayed clearly.
- Add a status selector to the task card or task details view.
- Display only the task statuses supported by the backend (for example, `todo`, `in-progress`, `submitted`, and `approved`, if these are the actual configured values).
- When a user selects a new status:
  1. Send the update using the existing task-status API.
  2. Display a loading state while the request is being processed.
  3. Update the displayed status after a successful response.
  4. If the request fails, keep or restore the previous status and display an appropriate error message.
- Respect the existing role-based permissions. Users must only be able to update statuses they are authorized to change.
- Prevent duplicate update requests while an update is already in progress.

### Implementation Notes
- Reuse the existing API service, authentication handling, status constants, and UI components wherever possible.
- Ensure the task card is responsive on both desktop and mobile.
- Make the status selector readable and usable in both light and dark modes.
- Do not change backend behavior or add new status values as part of this frontend task unless an API change is confirmed to be necessary.

## Acceptance Checklist

- [ ] Each task displays the number of assigned members who completed it and the total number of assigned members.
- [ ] The completion count updates after relevant assignment or status changes.
- [ ] Task cards display correctly, with no broken layout or overlapping content.
- [ ] Authorized users can select and update the task progress status.
- [ ] Users without the required permissions cannot change the status.
- [ ] Loading and error states are handled correctly.
- [ ] The updates work on desktop and mobile.
- [ ] The UI works in both light and dark modes.