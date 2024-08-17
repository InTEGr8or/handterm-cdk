exports.handler = async (event: { response: any; }) => {
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true; // If you want to auto-verify email addresses
  return event;
};