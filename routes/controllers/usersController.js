const CryptoJS = require("crypto-js");

const User = require("../../models/User");

const createClientEncryption = require("../../configs/createClientEncryption");

const saveEncryptedData = require("../../services/saveEncryptedData");
const getDecryptedData = require("../../services/getDecryptedData");
const updateEncryptedData = require("../../services/updateEncryptedData");
const createRandomPassword = require("../../services/createRandomPassword");

const ERROR = require("../../constants/error");

module.exports = {
  getUserInfo: async function (req, res, next) {
    const { userId } = req.params;
    try {
      const user = await User.findById(userId);
      const { passwordList } = user;

      const result = passwordList.map((item) => {
        return {
          id: item._id,
          url: item.name,
          username: item.username,
        };
      });

      const cipherText = CryptoJS.AES.encrypt(
        JSON.stringify(result),
        user.sessionKey
      ).toString();

      res.status(200).json(cipherText);
    } catch (err) {
      err.status = 500;
      err.errorMessage = ERROR.SERVER_ERROR;
      next(err);
    }
  },
  addPassword: async function (req, res, next) {
    const { userId } = req.params;
    const { cipherText } = req.body;

    try {
      const user = await User.findById(userId);

      const bytes = CryptoJS.AES.decrypt(cipherText, user.sessionKey);
      const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

      const result = await saveEncryptedData(userId, decryptedData);

      if (result === "serverError") {
        throw new Error(ERROR.SERVER_ERROR);
      }

      res.status(200).json("Your password has been successfully stored");
    } catch (err) {
      err.status = 500;
      next(err);
    }
  },
  getPassword: async function (req, res, next) {
    const { userId, passwordId } = req.params;

    try {
      const user = await User.findById(userId);
      const result = await getDecryptedData(userId, passwordId);

      if (result === "serverError") {
        throw new Error(ERROR.SERVER_ERROR);
      }

      const cipherText = CryptoJS.AES.encrypt(
        JSON.stringify(result),
        user.sessionKey
      ).toString();

      res.status(200).json(cipherText);
    } catch (err) {
      err.status = 500;
      next(err);
    }
  },
  updatePassword: async function (req, res, next) {
    const { userId, passwordId } = req.params;
    const { password } = req.body;

    try {
      const user = await User.findById(userId);

      const bytes = CryptoJS.AES.decrypt(password, user.sessionKey);
      const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

      const result = await updateEncryptedData(
        userId,
        passwordId,
        decryptedData
      );

      if (result === "serverError") {
        throw new Error(ERROR.SERVER_ERROR);
      }

      res.status(200).json("Your password has been successfully updated");
    } catch (err) {
      err.status = 500;
      next(err);
    }
  },
  deletePassword: async function (req, res, next) {
    const { userId, passwordId } = req.params;

    try {
      await User.findByIdAndUpdate(userId, {
        $pull: {
          passwordList: { _id: passwordId },
        },
      });

      res.sendStatus(200);
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  deleteAccount: async function (req, res, next) {
    const { userId } = req.params;

    try {
      await User.findByIdAndDelete(userId);
      res.sendStatus(200);
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  changeMasterPassword: async function (req, res, next) {
    const { userId } = req.params;
    const { salt, verifier } = req.body;

    try {
      await User.updateOne(
        { _id: userId },
        {
          $set: { verifier: JSON.stringify({ salt, verifier }) },
        }
      );

      res.sendStatus(200);
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  getAccountSetting: async function (req, res, next) {
    const { userId } = req.params;

    try {
      const userData = await User.findById(userId);

      res.status(200).json({
        passwordOption: userData.passwordStrength,
        sessionTimeout: userData.cookieExpire,
      });
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  setAccountSetting: async function (req, res, next) {
    const { userId } = req.params;
    const { type, option } = req.body;

    try {
      if (type === "password-strength") {
        await User.updateOne(
          { _id: userId },
          { $set: { passwordStrength: option } }
        );

        res
          .status(200)
          .json(`Your password generator strength type is "${option}".`);
      }

      if (type === "session-timeout") {
        await User.updateOne(
          { _id: userId },
          { $set: { cookieExpire: option } }
        );

        res.status(200).json(`Your login session timeout is "${option}".`);
      }
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  checkUrlData: async function (req, res, next) {
    const { userId, url } = req.params;
    const regExp = new RegExp(url, "i");

    try {
      const result = await User.findOne(
        {
          _id: userId,
          "passwordList.url": { $regex: regExp },
        },
        {
          "passwordList.$": 1,
        }
      );

      if (result) {
        const user = await User.findById(userId);

        let passwordData = result.passwordList[0];
        const { clientEncryption } = await createClientEncryption();

        passwordData.password = await clientEncryption.decrypt(
          passwordData.password
        );

        const cipherText = CryptoJS.AES.encrypt(
          JSON.stringify(passwordData),
          user.sessionKey
        ).toString();

        res.status(200).json(cipherText);
      } else {
        res.status(404).json({ errorMessage: "No Data Found" });
      }
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
  createRandomPassword: async function (req, res, next) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      const passwordStrength = user.passwordStrength;

      const randomPassword = createRandomPassword(passwordStrength);

      res.status(200).json({ data: randomPassword });
    } catch (err) {
      const error = new Error(ERROR.SERVER_ERROR);
      error.status = 500;
      next(error);
    }
  },
};
