/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "mfa": {
      "enabled": true,
      "rule": "mfaEnabled = true"
    },
    "otp": {
      "duration": 300,
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>Your sign-in code is:</p>\n<p><strong style=\"font-size:20px;letter-spacing:2px\">{OTP}</strong></p>\n<p>It expires in 5 minutes and works once. Enter it on the sign-in page to finish signing in.</p>\n<p><i>If you didn't just try to sign in, someone may know your password: change it now.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
        "subject": "Your sign-in code for {APP_NAME}"
      },
      "enabled": true
    }
  }, collection)

  // add field
  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "bool4135838427",
    "name": "mfaEnabled",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "mfa": {
      "enabled": false,
      "rule": ""
    },
    "otp": {
      "duration": 180,
      "emailTemplate": {
        "body": "<p>Hello,</p>\n<p>Your one-time password is: <strong>{OTP}</strong></p>\n<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
        "subject": "OTP for {APP_NAME}"
      },
      "enabled": false
    }
  }, collection)

  // remove field
  collection.fields.removeById("bool4135838427")

  return app.save(collection)
})
