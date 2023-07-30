import express from 'express'
import passport from 'passport';
import csurf from 'csurf';

export default function (): express.Router {
    const auth = express.Router();
    const csrfProtection = csurf();

    auth.post(
        '/login',
        passport.authenticate('local', {
            failWithError: true
        }),
        csurf({
            ignoreMethods: ['POST']
        }),
        function (
            req: express.Request & {
                user: { username: string; email: string; name: string, role: string };
            },
            res: express.Response
        ): void {
            res.status(200).json({
                username: req.user.username,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
                csrfToken: req.csrfToken()
            });
        }
    );

    auth.post('/logout', csrfProtection, (req, res) => {
        req.logout((err) => {
            if (!err) {
                res.status(200).send();
            } else {
                res.status(500).send(err.message);
            }
        });
    });
    return auth
}