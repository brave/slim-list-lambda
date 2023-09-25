#!/bin/bash

# This script runs in the docker container, to set up the rust toolchain
# needed to build the adblock-rs node module.

yum install -y openssl-devel nss;
curl https://sh.rustup.rs -sSf > /tmp/sh.rustup.rs;
sh /tmp/sh.rustup.rs -y;
source ~/.cargo/env;
npm config set audit false;
npm install;
#npm i npm@8 -g;
#npm audit fix;
