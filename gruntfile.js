module.exports = function(grunt) {
    "use strict";
  
    grunt.initConfig({
      copy: {
        public: {
          files: [
            {
              expand: true,
              cwd: "./public",
              src: ["**"],
              dest: "./dist"
            }
          ]
        },
        shared: {
          files: [
            {
              expand: true,
              cwd: "./shared",
              src: ["**"],
              dest: "./dist"
            }
          ]
        }
      },
      ts: {
        app: {
          files: [{
              src: ["\*.ts"],
              dest: "./dist"
            }],
          options: {
            experimentalDecorators: true,
            module: "commonjs",
            target: "es6",
            sourceMap: false,
            rootDir: "."
          }
        }
      },
      watch: {
        public: {
          files: ["./public/\*"],
          tasks: ["copy"]
        },
        shared: {
          files: ["./shared/\*\*/\*.ts"],
          tasks: ["ts"]
        },
        ts: {
          files: ["\*.ts"],
          tasks: ["ts"]
        }
      }
    });
  
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-ts");
  
    grunt.registerTask("default", [
      "copy",
      "ts"
    ]);
  
  };