sync.sh
TPWD=$PWD

cd ~/path/to/your/cloned/vault

git add -A
git commit -m "android backup at $(date)"
git pull
git push

cd $TPWD
