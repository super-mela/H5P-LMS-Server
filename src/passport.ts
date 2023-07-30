import passport from "passport";
import { Strategy as LocalStrategy } from 'passport-local';
import { userTable } from "./Constants/userTable";

export default function initPassport(): void {
    passport.use(
        new LocalStrategy((username, password, callback) => {
            // We don't check the password. In a real application you'll perform
            // DB access here.
            const user = userTable[username];
            if (!user) {
                callback('User not found in user table');
            } else {
                callback(null, user);
            }
        })
    );
    passport.serializeUser((user, done): void => {
        done(null, user);
    });

    passport.deserializeUser((user, done): void => {
        done(null, user);
    });
};