extern crate minigrep;

use std::env;
use std::process::exit;

use minigrep::Config;
use minigrep::run;

fn main() {
    let args = env::args();
    let config = Config::new(args).unwrap_or_else(|err| {
        eprintln!("Problem parsing arguments: {}", err);
        exit(1);
    });

    if let Err(e) = run(config) {
        eprintln!("Application error: {}", e);
        exit(1);
    }
}
